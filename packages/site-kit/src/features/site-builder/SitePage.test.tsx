import { render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accentPair } from '../../shared/SiteProvider'
import { SiteContext } from '../../shared/SiteContext'
import { ApiError } from '../../shared/api'
import BuilderPage, { EMBED_ID } from './BuilderPage'
import PreviewPage from './PreviewPage'
import { SitePage, findPage, pageHref } from './SitePage'
import vectors from './contrastVectors.json'
import type { SiteDocument } from './siteSchema'

vi.mock('../meny/Menu', () => ({ Menu: ({ hideHeading }: { hideHeading?: boolean }) => <p>Live meny{hideHeading ? ' utan rubrik' : ''}</p> }))
const post = vi.fn()
let refuse: null | (() => Promise<never>) = null
vi.mock('../../shared/api', async (orig) => ({
  ...(await orig<typeof import('../../shared/api')>()),
  apiPost: (...a: unknown[]) => (refuse ? refuse() : post(...a)),
}))

const doc: SiteDocument = {
  schemaVersion: 1,
  theme: { primaryColor: '#350001', accentColor: '#777777', font: 'sans' },
  nav: [{ pageId: 'start' }, { pageId: 'om-oss' }],
  footer: { text: 'Bistro A · Gatan 1' },
  pages: [
    { id: 'start', slug: '', title: 'Hem', seo: { title: 'Hem', description: '' }, blocks: [
      { id: 'hero', type: 'hero', heading: 'Välkommen', cta: { label: 'Om oss', link: 'page:om-oss' } },
      { id: 'boka', type: 'bookingCta', label: 'Boka nu' },
      { id: 'meny', type: 'menu' },
    ] },
    { id: 'om-oss', slug: 'om-oss', title: 'Om oss', seo: { title: 'Om oss', description: '' }, blocks: [
      { id: 't', type: 'text', heading: 'Vår historia', body: 'Första stycket.\n\nAndra stycket.' },
    ] },
  ],
}
const config = {
  tenant: { tenantId: 't1', name: 'Bistro A', site: { mode: 'builder', version: 2 }, features: { reservations: true } },
  legal: {},
}
const location = { locationId: 'l1', name: 'Bistro A', address: 'Gatan 1, Stad', businessHours: {} }
const wrap = (ui: React.ReactNode, path = '/') => (
  <MemoryRouter initialEntries={[path]}>
    <SiteContext.Provider value={{ config, location, setLocationId: () => {} } as never}>{ui}</SiteContext.Provider>
  </MemoryRouter>
)

afterEach(() => { document.getElementById(EMBED_ID)?.remove(); window.location.hash = '' })

describe('SitePage', () => {
  it('renders every block in order with own-page links and the server fallback for live blocks', () => {
    render(<SitePage doc={doc} page={doc.pages[0]} imageBase="" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Välkommen' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Om oss' }).every((a) => a.getAttribute('href') === '/om-oss')).toBe(true)
    expect(screen.getByRole('link', { name: 'Boka nu' })).toHaveAttribute('href', '/boka-bord')
    expect(screen.getByRole('link', { name: 'Se menyn' })).toHaveAttribute('href', '/meny')
    expect(screen.getByRole('link', { name: 'Hem' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Bistro A · Gatan 1')).toBeInTheDocument()
  })

  it('uses the live slot in the browser and splits text into paragraphs', () => {
    render(<SitePage doc={doc} page={doc.pages[0]} imageBase="" live={{ menu: () => <p>Live meny</p> }} />)
    expect(screen.getByText('Live meny')).toBeInTheDocument()
    render(<SitePage doc={doc} page={doc.pages[1]} imageBase="" />)
    expect(screen.getByText('Andra stycket.')).toBeInTheDocument()
  })

  it('has no <main> of its own (the layout has it), the brand nav Bar and the font class', () => {
    const { container } = render(<SitePage doc={doc} page={doc.pages[0]} imageBase="" />)
    expect(container.querySelector('main')).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'Webbplatsens sidor' })
    expect(nav).toHaveClass('bq-bar', 'bq-bar--nav')
    expect(screen.getByRole('link', { name: 'Hem' })).toHaveClass('bq-bar__item')
    expect(container.firstElementChild).toHaveClass('builder-site', 'builder-font-sans')
  })

  it('with onOpenPage, own-page links become buttons and other links stay links', () => {
    const open = vi.fn()
    render(<SitePage doc={doc} page={doc.pages[0]} imageBase="" onOpenPage={open} />)
    screen.getByRole('button', { name: 'Hem' }).click()
    expect(open).toHaveBeenCalledWith('start')
    expect(screen.queryByRole('link', { name: 'Om oss' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Boka nu' })).toHaveAttribute('href', '/boka-bord')
  })

  it('finds pages by path and has one Booqy look (no colours of its own)', () => {
    expect(findPage(doc, '/')?.id).toBe('start')
    expect(findPage(doc, '/om-oss/')?.id).toBe('om-oss')
    expect(findPage(doc, '/nope')).toBeNull()
    expect(pageHref(doc, 'om-oss')).toBe('/om-oss')
    const { container } = render(<SitePage doc={doc} page={doc.pages[0]} imageBase="" />)
    expect(container.firstElementChild?.getAttribute('style')).toBeNull()
  })

  it('leaves out a CTA block whose feature the restaurant does not have', () => {
    const ctas: SiteDocument = { ...doc, pages: [{ ...doc.pages[0], blocks: [
      { id: 'b', type: 'bookingCta' }, { id: 'o', type: 'orderCta' }, { id: 'c', type: 'cateringCta' },
    ] }] }
    render(<SitePage doc={ctas} page={ctas.pages[0]} imageBase="" features={{ reservations: true, ordering: false, catering: false }} />)
    expect(screen.getByRole('link', { name: 'Boka bord' })).toHaveAttribute('href', '/boka-bord')
    expect(screen.queryByRole('link', { name: 'Beställ mat' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Catering' })).toBeNull()
  })

  it('a contact block with showMap shows the address and a maps link', () => {
    const contact: SiteDocument = { ...doc, pages: [{ ...doc.pages[0], blocks: [
      { id: 'k', type: 'contact', showMap: true }, { id: 'k2', type: 'contact', heading: 'Utan karta' },
    ] }] }
    render(<SitePage doc={contact} page={contact.pages[0]} imageBase="" address="Gatan 1, Stad" />)
    expect(screen.getAllByText('Gatan 1, Stad')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Visa på karta' })).toHaveAttribute('href', 'https://maps.google.com/?q=Gatan%201%2C%20Stad')
  })

  it('the opening hours block links nowhere on the server and shows the live slot in the browser', () => {
    const hours: SiteDocument = { ...doc, pages: [{ ...doc.pages[0], blocks: [{ id: 'h', type: 'openingHours' }] }] }
    const { container, unmount } = render(<SitePage doc={hours} page={hours.pages[0]} imageBase="" />)
    expect(screen.getByRole('heading', { name: 'Öppettider' })).toBeInTheDocument()
    expect(container.querySelector('[data-block="h"] a')).toBeNull()
    unmount()
    render(<SitePage doc={hours} page={hours.pages[0]} imageBase="" live={{ openingHours: () => <p>Tiderna</p> }} />)
    expect(screen.getByText('Tiderna')).toBeInTheDocument()
  })
})

describe('contrast vectors shared with the publish check (application)', () => {
  it('accentPair gives exactly the Python answers', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(10)
    for (const v of vectors) {
      expect(accentPair(v.input, v.mode as 'light' | 'dark'), `${v.input} ${v.mode}`).toEqual({ accent: v.accent, onAccent: v.onAccent })
    }
  })
})

describe('BuilderPage', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => doc })) })
  afterEach(() => vi.unstubAllGlobals())

  it('renders the page for the path from the embedded document', async () => {
    const el = document.createElement('script')
    el.id = EMBED_ID
    el.type = 'application/json'
    el.textContent = JSON.stringify(doc)
    document.body.appendChild(el)
    render(wrap(<BuilderPage />, '/om-oss'))
    expect(screen.getByRole('heading', { name: 'Vår historia' })).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/site.json?v=2', { cache: 'no-cache' }))
  })

  it('shows the hours table, one Meny heading, and the page SEO title and description', async () => {
    const seo: SiteDocument = { ...doc, pages: [{ ...doc.pages[0], seo: { title: 'Hem | Bistro A', description: 'Bistro i stan' }, blocks: [
      { id: 'meny', type: 'menu' }, { id: 'h', type: 'openingHours' },
    ] }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => seo }))
    render(wrap(<BuilderPage />, '/'))
    expect(await screen.findByText('Live meny utan rubrik')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Meny' })).toHaveLength(1)
    expect(screen.getByRole('rowheader', { name: 'Mån-Sön' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Hem | Bistro A'))
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Bistro i stan')
  })

  it('removes the pre-rendered description and keeps only its own', async () => {
    const stale = document.createElement('meta')
    stale.name = 'description'
    stale.content = 'Landningssidans text'
    document.head.appendChild(stale)
    const { unmount } = render(wrap(<BuilderPage />, '/om-oss'))
    await screen.findByRole('heading', { name: 'Vår historia' })
    await waitFor(() => expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(0))
    unmount()
    const seo: SiteDocument = { ...doc, pages: [{ ...doc.pages[0], seo: { title: 'Hem', description: 'Bistro i stan' } }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => seo }))
    document.head.appendChild(stale)
    render(wrap(<BuilderPage />, '/'))
    await waitFor(() => expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1))
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Bistro i stan')
  })

  it('leaves out CTA blocks for features the plan does not have', async () => {
    const ctas: SiteDocument = { ...doc, pages: [{ ...doc.pages[0], blocks: [{ id: 'o', type: 'orderCta' }, { id: 'b', type: 'bookingCta' }] }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ctas }))
    render(wrap(<BuilderPage />, '/'))
    expect(await screen.findByRole('link', { name: 'Boka bord' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Beställ mat' })).toBeNull()
  })

  it('says the page does not exist for an unknown path', async () => {
    render(wrap(<BuilderPage />, '/finns-inte'))
    expect(await screen.findByText('Sidan finns inte.')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Sidan finns inte - Bistro A'))
  })

  it('keeps a tab title after navigating in the app to an unknown builder path', async () => {
    render(wrap(<><Link to="/gammal-lank">Gammal länk</Link><BuilderPage /></>, '/om-oss'))
    await waitFor(() => expect(document.title).toBe('Om oss'))
    screen.getByRole('link', { name: 'Gammal länk' }).click()
    expect(await screen.findByText('Sidan finns inte.')).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Sidan finns inte - Bistro A'))
  })

  it('never draws something that is not a site document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }))
    render(wrap(<BuilderPage />, '/om-oss'))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByText('Den här sidan är på väg.')).toBeInTheDocument()
  })
})

describe('PreviewPage', () => {
  beforeEach(() => { post.mockReset(); refuse = null })

  it('posts the fragment token in the body and shows the draft', async () => {
    window.location.hash = '#secret-token-from-the-link'
    post.mockResolvedValue({ doc })
    render(wrap(<PreviewPage />, '/forhandsvisning'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Välkommen' })).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/public/site-builder/preview', { tenantId: 't1', token: 'secret-token-from-the-link' })
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  it('shows one page bar (the site nav) and switches draft pages inside the preview', async () => {
    window.location.hash = '#secret-token-from-the-link'
    post.mockResolvedValue({ doc })
    const { container } = render(wrap(<PreviewPage />, '/forhandsvisning'))
    const pages = await screen.findByRole('navigation', { name: 'Webbplatsens sidor' })
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(pages).toHaveClass('bq-bar', 'bq-bar--nav')
    expect(screen.getAllByRole('button', { name: 'Hem' })[0]).toHaveAttribute('aria-current', 'page')
    // no own-page link leaves the preview for the live /<slug>
    expect(container.querySelector('a[href="/om-oss"], a[href="/"]')).toBeNull()
    screen.getAllByRole('button', { name: 'Om oss' })[0].click()
    expect(await screen.findByRole('heading', { name: 'Vår historia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Om oss' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Hem' })).not.toHaveAttribute('aria-current')
    expect(window.location.hash).toBe('#secret-token-from-the-link')
  })

  it('a page: link in a block opens the draft page in the preview too', async () => {
    window.location.hash = '#secret-token-from-the-link'
    post.mockResolvedValue({ doc })
    render(wrap(<PreviewPage />, '/forhandsvisning'))
    await screen.findByRole('heading', { level: 1, name: 'Välkommen' })
    const cta = screen.getAllByRole('button', { name: 'Om oss' }).find((b) => b.classList.contains('btn'))!
    cta.click()
    expect(await screen.findByRole('heading', { name: 'Vår historia' })).toBeInTheDocument()
  })

  it('without a token nothing is asked', async () => {
    render(wrap(<PreviewPage />, '/forhandsvisning'))
    expect(await screen.findByText('Länken fungerar inte längre. Be om en ny länk.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('shows the printing loader while it loads', async () => {
    window.location.hash = '#secret-token-from-the-link'
    post.mockReturnValue(new Promise(() => {}))
    render(wrap(<PreviewPage />, '/forhandsvisning'))
    expect(await screen.findByText('Hämtar förhandsvisningen…')).toBeInTheDocument()
    expect(document.querySelector('.bq-printing')).not.toBeNull()
  })

  it('a network or server error offers a retry, not the expired text', async () => {
    window.location.hash = '#secret-token-from-the-link'
    post.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ doc })
    render(wrap(<PreviewPage />, '/forhandsvisning'))
    expect(await screen.findByText(/Förhandsvisningen kunde inte hämtas/)).toBeInTheDocument()
    expect(screen.queryByText('Länken fungerar inte längre. Be om en ny länk.')).toBeNull()
    screen.getByRole('button', { name: 'Försök igen' }).click()
    expect(await screen.findByRole('heading', { level: 1, name: 'Välkommen' })).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('a refused token shows the expired text, never another site', async () => {
    window.location.hash = '#bad-token'
    let calls = 0
    refuse = () => { calls += 1; return Promise.reject(new ApiError(404, 'not found')) }
    render(wrap(<PreviewPage />, '/forhandsvisning'))
    await waitFor(() => expect(calls).toBe(1))
    expect(await screen.findByText('Länken fungerar inte längre. Be om en ny länk.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Välkommen' })).not.toBeInTheDocument()
  })
})
