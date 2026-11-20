import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteProvider } from './SiteProvider'
import { useSite } from './SiteContext'
import { json, siteConfig } from '../test/siteData'

function Name() {
  const { config, location } = useSite()
  return <p>{config.tenant.name} / {location.locationId}</p>
}

function renderSite() {
  return render(
    <MemoryRouter>
      <SiteProvider>
        <Name />
      </SiteProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('SiteProvider', () => {
  it('loads the restaurant for ?restaurang= and hands it to the site', async () => {
    window.history.replaceState(null, '', '/?restaurang=testkrogen')
    const fetchMock = vi.fn(async (_url: string) => json(siteConfig()))
    vi.stubGlobal('fetch', fetchMock)

    renderSite()

    expect(await screen.findByText('Testkrogen / loc-1')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/site-config?slug=testkrogen')
    expect(document.title).toBe('Testkrogen')
  })

  it('an unknown or suspended restaurant shows a neutral page, nothing else', async () => {
    window.history.replaceState(null, '', '/?restaurang=nobody')
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'not found' }, 404)))

    renderSite()

    expect(await screen.findByRole('heading', { name: 'Sidan är inte tillgänglig' })).toBeInTheDocument()
    expect(screen.queryByText(/Testkrogen/)).not.toBeInTheDocument()
  })

  it('a network error offers a retry instead of another restaurant', async () => {
    window.history.replaceState(null, '', '/?restaurang=testkrogen')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    renderSite()

    expect(await screen.findByRole('button', { name: 'Försök igen' })).toBeInTheDocument()
  })
})

describe('SiteProvider and the site language', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('lang')
    document.documentElement.removeAttribute('dir')
  })

  it('translates the page after the restaurant is known, keeping its name', async () => {
    window.history.replaceState(null, '', '/?restaurang=testkrogen&lang=en')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/site-config')) return json(siteConfig())
      const body = JSON.parse(String(init?.body)) as { texts: string[] }
      return json({ lang: 'en', texts: body.texts.map((t) => `EN ${t}`) })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(
      <MemoryRouter>
        <SiteProvider>
          <p>Välkommen</p>
        </SiteProvider>
      </MemoryRouter>,
    )
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(await screen.findByText('EN Välkommen')).toBeInTheDocument()
    const calls = fetchMock.mock.calls.map((c) => c[0])
    expect(calls[0]).toContain('/site-config')
    const translate = fetchMock.mock.calls.find((c) => c[0] === 'https://api.test/translate')!
    const body = JSON.parse(String(translate[1]?.body)) as { slug: string; keep: string[] }
    expect(body.slug).toBe('testkrogen')
    expect(body.keep).toContain('Testkrogen')
  })
})
