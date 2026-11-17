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
