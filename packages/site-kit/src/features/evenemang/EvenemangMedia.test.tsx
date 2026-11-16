import { render, screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureSiteKit } from '../../config'
import { WithSite } from '../../test/siteFixture'
import { siteConfig } from '../../test/siteData'
import BiljettPage from './BiljettPage'
import EvenemangDetaljPage from './EvenemangDetaljPage'
import EvenemangPage from './EvenemangPage'
import * as api from './eventsApi'
import type { PublicEvent, TicketPageData } from './eventsApi'

/** Evenemangsbilder (K15/K16 imageKey + imageAlt) och Wallet-knapparna (K18 wallet, K19 länken). */

vi.mock('./eventsApi', async (orig) => ({
  ...(await orig<typeof import('./eventsApi')>()),
  listEvents: vi.fn(), getEvent: vi.fn(), getTickets: vi.fn(),
}))
vi.mock('../../shared/payment/stripe', () => ({ stripeFor: () => null }))
vi.mock('../boka/TurnstileWidget', () => ({ TurnstileWidget: () => null }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (data: string) => `data:image/png;base64,${btoa(data)}`) } }))

const FEATURES = { reservations: true, ordering: false, catering: false, terminal: false, events: true }
const KEY = 'menu-images/t1/locations/loc-1/menu/0f8fad5b-d9cb-469f-a165-70867728950e.webp'
const ALT = 'Långbord dukat med vinglas i levande ljus'

function site(path: string, routePath: string, ui: React.ReactNode) {
  return render(
    <WithSite config={siteConfig({ features: FEATURES })} path={path}>
      <Routes><Route path={routePath} element={ui} /></Routes>
    </WithSite>,
  )
}

const EVENT: PublicEvent = {
  eventId: 'ev1abcdef', title: 'Vinprovning', description: 'Fem viner.', perOrderMax: 4, imageKey: KEY, imageAlt: ALT,
  occurrences: [{ occurrenceId: 'ev1abcdef-x', startAt: '2026-11-20T18:00:00Z', left: 3, soldOut: false, salesOpen: true }],
  ticketTypes: [{ typeId: 'vuxen0001', name: 'Vuxen', priceSek: 450, perOrderMax: 4, available: true }],
}

const TICKETS: TicketPageData = {
  event: { eventId: 'ev1abcdef', title: 'Vinprovning' },
  occurrence: { occurrenceId: 'ev1abcdef-x', startAt: '2026-11-20T18:00:00Z', status: 'scheduled' },
  tickets: [
    { ticketId: 'tk1aaaaaaaa', typeName: 'Vuxen', holderName: 'Sara Ek', status: 'valid', qr: 'tk1aaaaaaaa.0123456789abcdef' },
    { ticketId: 'tk2aaaaaaaa', typeName: 'Vuxen', holderName: 'Sara Ek', status: 'refunded' },
  ],
  wallet: { apple: true, google: true },
  transferAllowed: false,
  resaleAllowed: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  configureSiteKit({ apiBaseUrl: 'https://api.example', menuImageBaseUrl: 'https://cdn.example/' })
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  configureSiteKit({ apiBaseUrl: '', menuImageBaseUrl: '' })
})

describe('event images', () => {
  it('shows the image with its alt text in the list, and none for an event without one', async () => {
    vi.mocked(api.listEvents).mockResolvedValue({ events: [
      { eventId: 'ev1abcdef', title: 'Vinprovning', imageKey: KEY, imageAlt: ALT, nextOccurrence: '2026-11-20T18:00:00Z', fromPriceSek: 450, soldOut: false },
      { eventId: 'ev2abcdef', title: 'Quiz', nextOccurrence: '2026-11-21T18:00:00Z', fromPriceSek: 0, soldOut: false },
    ] })
    site('/evenemang', '/evenemang', <EvenemangPage />)
    const img = await screen.findByRole('img', { name: ALT })
    expect(img).toHaveAttribute('src', `https://cdn.example/${KEY}`)
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(screen.getAllByRole('img')).toHaveLength(1)
    const quiz = screen.getByRole('link', { name: 'Quiz' }).closest('li') as HTMLElement
    expect(within(quiz).queryByRole('img')).toBeNull()
  })

  it('shows the image on the event page', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(EVENT)
    site('/evenemang/ev1abcdef', '/evenemang/:eventId', <EvenemangDetaljPage />)
    expect(await screen.findByRole('img', { name: ALT })).toHaveAttribute('src', `https://cdn.example/${KEY}`)
  })

  it('shows no image when the site has no image CDN', async () => {
    configureSiteKit({ apiBaseUrl: 'https://api.example', menuImageBaseUrl: '' })
    vi.mocked(api.getEvent).mockResolvedValue(EVENT)
    site('/evenemang/ev1abcdef', '/evenemang/:eventId', <EvenemangDetaljPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Vinprovning' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: ALT })).toBeNull()
  })
})

describe('Wallet buttons', () => {
  it('links each valid ticket to its own Apple and Google pass when the API says Wallet is available', async () => {
    vi.mocked(api.getTickets).mockResolvedValue(TICKETS)
    site('/biljett#abc.def', '/biljett', <BiljettPage />)
    const apple = await screen.findByRole('link', { name: 'Lägg till i Apple Wallet: Vuxen (1 av 2)' })
    expect(apple).toHaveTextContent('Lägg till i Apple Wallet')
    expect(apple).toHaveAttribute('href', 'https://api.example/public/tickets/abc.def/pass?ticketId=tk1aaaaaaaa&kind=apple')
    expect(screen.getByRole('link', { name: 'Lägg till i Google Wallet: Vuxen (1 av 2)' }))
      .toHaveAttribute('href', 'https://api.example/public/tickets/abc.def/pass?ticketId=tk1aaaaaaaa&kind=google')
    // the refunded ticket gets no pass
    expect(screen.getAllByRole('link', { name: /Wallet/ })).toHaveLength(2)
  })

  it('shows only the kind the API offers', async () => {
    vi.mocked(api.getTickets).mockResolvedValue({ ...TICKETS, wallet: { apple: false, google: true } })
    site('/biljett#abc.def', '/biljett', <BiljettPage />)
    expect(await screen.findByRole('link', { name: /Google Wallet/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Apple Wallet/ })).toBeNull()
  })

  it('shows no Wallet buttons while the API says Wallet is off', async () => {
    vi.mocked(api.getTickets).mockResolvedValue({ ...TICKETS, wallet: { apple: false, google: false } })
    site('/biljett#abc.def', '/biljett', <BiljettPage />)
    expect(await screen.findAllByText('Namn: Sara Ek')).toHaveLength(2)
    expect(screen.queryByText(/Wallet/)).toBeNull()
  })
})
