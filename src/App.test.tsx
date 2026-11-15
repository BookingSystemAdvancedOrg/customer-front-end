import { cleanup, render, screen } from '@testing-library/react'
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

describe('feature routes (gift cards, queue, site builder)', () => {
  const ALL_ON = { reservations: true, ordering: false, catering: false, terminal: false, giftCards: true, waitlist: true, siteBuilder: true }

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

  it('routes nothing new while the features are off: the paths fall back to the menu', async () => {
    for (const path of ['/presentkort', '/presentkort/saldo', '/ko', '/forhandsvisning', '/en-sida']) {
      const { unmount } = renderAt(path, {})
      await screen.findByRole('link', { name: 'Testkrogen - startsida' })
      expect(screen.queryByRole('heading', { name: /Presentkort|Saldo på presentkort|Kö|Förhandsvisning/ })).not.toBeInTheDocument()
      expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Presentkort' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('routes gift cards, balance and preview, and links Presentkort in the nav, when on', async () => {
    renderAt('/presentkort', { features: ALL_ON })
    expect(await screen.findByRole('heading', { name: 'Presentkort' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Presentkort' }).length).toBeGreaterThan(0)
    cleanup()
    renderAt('/presentkort/saldo', { features: ALL_ON })
    expect(await screen.findByRole('heading', { name: 'Saldo på presentkort' })).toBeInTheDocument()
    cleanup()
    renderAt('/forhandsvisning', { features: ALL_ON })
    expect(await screen.findByRole('heading', { name: 'Förhandsvisning' })).toBeInTheDocument()
  })

  it('routes the queue only when the location takes queue sign-ups on the site', async () => {
    renderAt('/ko', { features: ALL_ON })
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByRole('heading', { name: 'Kö' })).not.toBeInTheDocument()
    cleanup()
    renderAt('/ko', { features: ALL_ON }, true)
    expect(await screen.findByRole('heading', { name: 'Kö' })).toBeInTheDocument()
  })

  it('draws the start page as the builder start page for a published builder site, the menu otherwise', async () => {
    renderAt('/', { features: ALL_ON, site: { mode: 'builder', version: 2 } })
    expect(await screen.findByText('Den här sidan är på väg.')).toBeInTheDocument()
    cleanup()
    renderAt('/meny', { features: ALL_ON, site: { mode: 'builder', version: 2 } })
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
    for (const site of [{ mode: 'builder' as const, version: 0 }, { mode: 'custom' as const, version: 3 }]) {
      cleanup()
      renderAt('/', { features: ALL_ON, site })
      await screen.findByRole('link', { name: 'Testkrogen - startsida' })
      expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
    }
  })

  it('draws unknown paths as builder pages only for a published builder site', async () => {
    renderAt('/en-sida', { features: ALL_ON, site: { mode: 'builder', version: 0 } })
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
    cleanup()
    renderAt('/en-sida', { features: ALL_ON, site: { mode: 'custom', version: 3 } })
    await screen.findByRole('link', { name: 'Testkrogen - startsida' })
    expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
    cleanup()
    renderAt('/en-sida', { features: ALL_ON, site: { mode: 'builder', version: 2 } })
    expect(await screen.findByText('Den här sidan är på väg.')).toBeInTheDocument()
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

  it('routes and links nothing while events is off or missing: the paths fall back to the menu', async () => {
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

  it('is not shadowed by a published builder site', async () => {
    const tenant = { features: { reservations: true, siteBuilder: true, events: true }, site: { mode: 'builder' as const, version: 2 } }
    renderAt('/evenemang', tenant)
    expect(await screen.findByRole('heading', { name: 'Evenemang' })).toBeInTheDocument()
    expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
    cleanup()
    renderAt('/biljett/ta-emot', tenant)
    expect(await screen.findByRole('heading', { name: 'Ta emot biljett' })).toBeInTheDocument()
    expect(screen.queryByText('Den här sidan är på väg.')).not.toBeInTheDocument()
  })
})
