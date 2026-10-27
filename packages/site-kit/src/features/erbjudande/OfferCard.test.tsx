import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfferCard } from './OfferCard'
import { offerAllowedOn } from './offerApi'
import { WithSite } from '../../test/siteFixture'
import { json, siteConfig } from '../../test/siteData'
import { OFFER_CARD_KEY } from '../../shared/storageRegistry'

vi.mock('../boka/TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken, action }: { onToken: (t: string | null) => void; action: string }) => (
    <button type="button" onClick={() => onToken(`token-${action}`)}>Jag är inte en robot</button>
  ),
}))
vi.mock('../../shared/api', async (orig) => ({
  ...(await orig<typeof import('../../shared/api')>()),
  apiBaseUrl: () => 'https://api.test',
  isApiConfigured: () => true,
}))

const OFFER = {
  percent: 10, minOrderOre: 20000, validDays: 30, headline: '10 % på din nästa beställning',
  text: 'Lämna din e-post.', buttonLabel: 'Skicka min rabattkod', imageUrl: null, dishName: null,
  delaySeconds: 0, scrollPercent: 0, pages: 'all', frequency: 'visit', showOnMobile: true,
}

let fetchMock: ReturnType<typeof vi.fn>
let offer: Record<string, unknown> | null
let signup: () => Response

function config() {
  return siteConfig({ features: { reservations: true, ordering: true, catering: false, terminal: false, marketing: true } })
}

beforeEach(() => {
  sessionStorage.clear()
  offer = { ...OFFER }
  signup = () => json({ sent: true, expiresAt: '2026-11-18T10:00:00Z' })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/m/offer')) return json({ offer })
    if (url.endsWith('/m/signup') && init?.method === 'POST') return signup()
    if (url.endsWith('/t')) return new Response(null, { status: 204 })
    return json({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function posted(path: string) {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url).endsWith(path) && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init!.body)))
}

describe('OfferCard', () => {
  it('never shows on booking, ordering or checkout pages', () => {
    expect(offerAllowedOn('/meny', 'all')).toBe(true)
    expect(offerAllowedOn('/om-oss', 'menu')).toBe(false)
    for (const path of ['/boka-bord', '/bestall', '/bestallning/a/b', '/bokning/a/b', '/catering', '/integritetspolicy']) {
      expect(offerAllowedOn(path, 'all')).toBe(false)
    }
  })

  it('appears after the delay, counts one view and signs up with consent', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config()} path="/meny"><OfferCard /></WithSite>)
    const heading = await screen.findByRole('heading', { name: '10 % på din nästa beställning' }, { timeout: 2500 })
    expect(heading).toBeInTheDocument()
    expect(posted('/t')).toEqual([{ locationId: 'loc-1', type: 'offer' }])
    expect(sessionStorage.getItem(OFFER_CARD_KEY)).toBeNull() // only the guest's own choices are stored
    expect(screen.getByText(/Gäller en gång, vid beställning för minst 200 kr, koden gäller i 30 dagar/)).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('din@epost.se'), 'ny@example.se')
    await user.click(screen.getByRole('button', { name: 'Skicka min rabattkod' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kryssa i att du vill få erbjudanden')
    expect(posted('/m/signup')).toEqual([])
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Skicka min rabattkod' }))
    expect(await screen.findByRole('heading', { name: 'Koden är på väg!' })).toBeInTheDocument()
    expect(posted('/m/signup')).toEqual([{ locationId: 'loc-1', email: 'ny@example.se', consent: true }])
    expect(sessionStorage.getItem(OFFER_CARD_KEY)).toBe('claimed')
  })

  it('stays closed for the rest of the visit once closed', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<WithSite config={config()} path="/"><OfferCard /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Stäng erbjudandet' }, { timeout: 2500 }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(OFFER_CARD_KEY)).toBe('closed')
    unmount()
    render(<WithSite config={config()} path="/"><OfferCard /></WithSite>)
    await new Promise((r) => setTimeout(r, 1300))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('shows nothing without a live offer', async () => {
    offer = null
    render(<WithSite config={config()} path="/"><OfferCard /></WithSite>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 1300))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('explains a refused sign-up', async () => {
    const user = userEvent.setup()
    signup = () => json({ error: 'too_many_requests' }, 429)
    render(<WithSite config={config()} path="/"><OfferCard /></WithSite>)
    await user.type(await screen.findByPlaceholderText('din@epost.se', {}, { timeout: 2500 }), 'ny@example.se')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Skicka min rabattkod' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('För många försök')
  })
})
