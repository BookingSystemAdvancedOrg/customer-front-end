import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteProvider } from '@booqy/site-kit'
import { json, siteConfig } from '@booqy/site-kit/testing'
import App from './App'

function renderSite() {
  return render(
    <MemoryRouter>
      <SiteProvider>
        <App />
      </SiteProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  sessionStorage.clear()
})

describe('App on SiteProvider', () => {
  it('renders the restaurant from /site-config - its name, legal entity and nav', async () => {
    window.history.replaceState(null, '', '/?restaurang=testkrogen')
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/site-config')) return json(siteConfig())
      return json({ items: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderSite()

    expect(await screen.findByRole('link', { name: 'Testkrogen - startsida' })).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/site-config?slug=testkrogen')
    expect(screen.getAllByRole('link', { name: 'Boka bord' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/Testkrogen AB/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Integritetspolicy' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/anar/i)
    expect(document.title).toBe('Testkrogen')
  })

  it('hides booking when the plan has no reservations', async () => {
    window.history.replaceState(null, '', '/?restaurang=testkrogen')
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/site-config')
        ? json(siteConfig({ features: { reservations: false } }))
        : json({ items: [] })))

    renderSite()

    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByRole('link', { name: 'Boka bord' })).not.toBeInTheDocument()
  })

  it('an unknown or suspended restaurant shows a neutral page, nothing else', async () => {
    window.history.replaceState(null, '', '/?restaurang=nobody')
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'not found' }, 404)))

    renderSite()

    expect(await screen.findByRole('heading', { name: 'Sidan är inte tillgänglig' })).toBeInTheDocument()
  })

  it('a network error offers a retry instead of another restaurant', async () => {
    window.history.replaceState(null, '', '/?restaurang=testkrogen')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    renderSite()

    expect(await screen.findByRole('button', { name: 'Försök igen' })).toBeInTheDocument()
  })
})

describe('feature routes (gift cards, queue)', () => {
  const ALL_ON = { reservations: true, ordering: false, catering: false, terminal: false, giftCards: true, waitlist: true }

  function renderAt(path: string, tenant: Parameters<typeof siteConfig>[0], publicJoin = false) {
    window.history.replaceState(null, '', '/?restaurang=testkrogen')
    const config = siteConfig(tenant)
    if (publicJoin) config.locations[0].waitlist = { publicJoin: true }
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/site-config') ? json(config) : json({ items: [] })))
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SiteProvider>
          <App />
        </SiteProvider>
      </MemoryRouter>,
    )
  }

  it('routes nothing new while the features are off: the paths show the not-found page', async () => {
    for (const path of ['/presentkort', '/presentkort/saldo', '/ko', '/forhandsvisning', '/en-sida']) {
      const { unmount } = renderAt(path, {})
      await screen.findByRole('link', { name: 'Testkrogen - startsida' })
      expect(screen.queryByRole('heading', { name: /Presentkort|Saldo på presentkort|Kö|Förhandsvisning/ })).not.toBeInTheDocument()
      expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Presentkort' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('routes gift cards and balance, and links Presentkort in the nav, when on', async () => {
    renderAt('/presentkort', { features: ALL_ON })
    expect(await screen.findByRole('heading', { name: 'Presentkort' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Presentkort' }).length).toBeGreaterThan(0)
    cleanup()
    renderAt('/presentkort/saldo', { features: ALL_ON })
    expect(await screen.findByRole('heading', { name: 'Saldo på presentkort' })).toBeInTheDocument()
  })

  it('routes the queue only when the location takes queue sign-ups on the site', async () => {
    renderAt('/ko', { features: ALL_ON })
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByRole('heading', { name: 'Kö' })).not.toBeInTheDocument()
    cleanup()
    renderAt('/ko', { features: ALL_ON }, true)
    expect(await screen.findByRole('heading', { name: 'Kö' })).toBeInTheDocument()
  })

  it('ignores what the removed site builder left on a restaurant: menu start page, no preview, no builder pages', async () => {
    // An older /site-config, or a stored entitlement, may still carry these.
    const stale = { features: { ...ALL_ON, siteBuilder: true }, site: { mode: 'builder', version: 2 } } as Parameters<typeof siteConfig>[0]
    renderAt('/', stale)
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Testkrogen'))
    for (const path of ['/forhandsvisning', '/en-sida']) {
      cleanup()
      renderAt(path, stale)
      expect(await screen.findByRole('heading', { level: 1, name: 'Sidan finns inte' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Förhandsvisning' })).not.toBeInTheDocument()
    }
  })

  it('an unknown path says the page does not exist, with links only to what the restaurant has', async () => {
    renderAt('/en-sida', { features: { reservations: true, events: false } })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sidan finns inte' })).toBeInTheDocument()
    const card = screen.getByRole('heading', { level: 1, name: 'Sidan finns inte' }).closest('section')!
    expect(within(card).getByRole('link', { name: 'Meny' })).toHaveAttribute('href', '/meny')
    expect(within(card).getByRole('link', { name: 'Boka bord' })).toHaveAttribute('href', '/boka-bord')
    expect(within(card).queryByRole('link', { name: 'Evenemang' })).toBeNull()
    expect(document.title).toBe('Sidan finns inte - Testkrogen')
  })

  it('names the page in the tab title', async () => {
    renderAt('/kontakt', { features: ALL_ON })
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    await waitFor(() => expect(document.title).toBe('Kontakt - Testkrogen'))
  })
})

describe('event routes (events and tickets)', () => {
  const EVENT_PATHS = ['/evenemang', '/evenemang/01JEVENT', '/biljett', '/biljett/ta-emot']
  const HEADINGS = /^(Evenemang|Dina biljetter|Ta emot biljett)$/

  function renderAt(path: string, tenant: Parameters<typeof siteConfig>[0]) {
    window.history.replaceState(null, '', '/?restaurang=testkrogen')
    const config = siteConfig(tenant)
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/site-config') ? json(config) : json({ items: [] })))
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SiteProvider>
          <App />
        </SiteProvider>
      </MemoryRouter>,
    )
  }

  it('routes and links nothing while events is off or missing: the paths show the not-found page', async () => {
    for (const features of [undefined, { reservations: true, events: false }]) {
      for (const path of EVENT_PATHS) {
        const { unmount } = renderAt(path, features ? { features } : {})
        await screen.findByRole('link', { name: 'Testkrogen - startsida' })
        expect(screen.queryByRole('heading', { name: HEADINGS })).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Evenemang' })).not.toBeInTheDocument()
        unmount()
      }
    }
  })

  it('routes the list, detail, tickets and receive pages and links Evenemang in the nav when on', async () => {
    const expected = ['Evenemang', 'Evenemang', 'Dina biljetter', 'Ta emot biljett']
    for (const [i, path] of EVENT_PATHS.entries()) {
      const { unmount } = renderAt(path, { features: { reservations: true, events: true } })
      expect(await screen.findByRole('heading', { name: expected[i] })).toBeInTheDocument()
      expect(screen.getAllByRole('link', { name: 'Evenemang' }).length).toBeGreaterThan(0)
      unmount()
    }
  })
})
