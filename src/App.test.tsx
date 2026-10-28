import { render, screen } from '@testing-library/react'
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
