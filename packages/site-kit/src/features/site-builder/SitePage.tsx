import type { CSSProperties, ReactNode } from 'react'
import { accentPair } from '../../shared/SiteProvider'
import type { SiteBlock, SiteDocument, SitePage as Page } from './siteSchema'
import './site-builder.css'

/**
 * One page of a site built in Webbplats, from the published (or draft)
 * document. The same component renders on the server (render Lambda,
 * react-dom/server) and in the browser, so the pre-rendered HTML and the
 * hydrated page never differ. Live blocks (menu, opening hours) get their
 * content from `live` slots: the browser passes the site-kit components,
 * the server renders the link only.
 */
export interface LiveSlots {
  menu?: (block: SiteBlock) => ReactNode
  openingHours?: (block: SiteBlock) => ReactNode
}

export interface SitePageProps {
  doc: SiteDocument
  page: Page
  /** menu-image base URL (no trailing slash); images are left out when empty. */
  imageBase: string
  live?: LiveSlots
  /**
   * The draft preview: own-page links (nav and `page:` links) open the page
   * inside the preview instead of leaving for /<slug> (the live site).
   */
  onOpenPage?: (pageId: string) => void
}

export function pageHref(doc: SiteDocument, pageId: string): string {
  const page = doc.pages.find((p) => p.id === pageId)
  return page ? `/${page.slug}` : '/'
}

function linkHref(doc: SiteDocument, link: string): string {
  return link.startsWith('page:') ? pageHref(doc, link.slice(5)) : link
}

/** The theme as the site's own CSS variables (nudged to readable like the rest of the site). */
export function themeStyle(doc: SiteDocument): CSSProperties {
  const light = accentPair(doc.theme.accentColor, 'light')
  const dark = accentPair(doc.theme.accentColor, 'dark')
  return {
    ['--tenant-accent' as string]: light.accent,
    ['--tenant-on-accent' as string]: light.onAccent,
    ['--tenant-accent-dark' as string]: dark.accent,
    ['--tenant-on-accent-dark' as string]: dark.onAccent,
  }
}

export function findPage(doc: SiteDocument, pathname: string): Page | null {
  const slug = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? ''
  return doc.pages.find((p) => p.slug === slug) ?? null
}

const CTA: Record<string, { href: string; label: string }> = {
  bookingCta: { href: '/boka-bord', label: 'Boka bord' },
  orderCta: { href: '/bestall', label: 'Beställ mat' },
  cateringCta: { href: '/catering', label: 'Catering' },
}

function Block({ doc, block, imageBase, live, onOpenPage }: { doc: SiteDocument; block: SiteBlock; imageBase: string; live?: LiveSlots; onOpenPage?: (pageId: string) => void }) {
  const img = (key: string) => (imageBase ? `${imageBase}/${key}` : '')
  switch (block.type) {
    case 'hero':
      return (
        <section className="page-hero" data-block={block.id}>
          {block.image && imageBase ? <img src={img(block.image)} alt="" /> : null}
          <h1>{block.heading}</h1>
          {block.text ? <p className="page-lede">{block.text}</p> : null}
          {block.cta && onOpenPage && block.cta.link.startsWith('page:')
            ? <button type="button" className="btn btn-primary" onClick={() => onOpenPage(block.cta!.link.slice(5))}>{block.cta.label}</button>
            : block.cta ? <a className="btn btn-primary" href={linkHref(doc, block.cta.link)}>{block.cta.label}</a> : null}
        </section>
      )
    case 'text':
      return (
        <section className="page-prose" data-block={block.id}>
          {block.heading ? <h2>{block.heading}</h2> : null}
          {block.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </section>
      )
    case 'image':
      return (
        <figure className="page-prose" data-block={block.id}>
          {imageBase ? <img src={img(block.image)} alt={block.alt} /> : null}
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      )
    case 'gallery':
      return (
        <section className="page-prose" data-block={block.id}>
          {block.heading ? <h2>{block.heading}</h2> : null}
          <ul className="builder-gallery">{block.images.map((i) => <li key={i.image}>{imageBase ? <img src={img(i.image)} alt={i.alt} /> : i.alt}</li>)}</ul>
        </section>
      )
    case 'menu':
      return (
        <section className="page-prose" data-block={block.id}>
          {block.heading ? <h2>{block.heading}</h2> : <h2>Meny</h2>}
          {live?.menu ? live.menu(block) : <a className="btn btn-secondary" href="/meny">Se menyn</a>}
        </section>
      )
    case 'openingHours':
      return (
        <section className="page-prose" data-block={block.id}>
          <h2>{block.heading ?? 'Öppettider'}</h2>
          {live?.openingHours ? live.openingHours(block) : <a href="/kontakt">Se öppettider</a>}
        </section>
      )
    case 'bookingCta':
    case 'orderCta':
    case 'cateringCta':
      return (
        <section className="page-prose" data-block={block.id}>
          {block.heading ? <h2>{block.heading}</h2> : null}
          {block.text ? <p>{block.text}</p> : null}
          <a className="btn btn-primary" href={CTA[block.type].href}>{block.label ?? CTA[block.type].label}</a>
        </section>
      )
    case 'contact':
      return (
        <section className="page-prose" data-block={block.id}>
          <h2>{block.heading ?? 'Kontakt'}</h2>
          <a href="/kontakt">Hitta hit och kontakta oss</a>
        </section>
      )
  }
}

export function SitePage({ doc, page, imageBase, live, onOpenPage }: SitePageProps) {
  return (
    <div className={`builder-site builder-font-${doc.theme.font}`} style={themeStyle(doc)}>
      {/* The brand nav Bar's markup (Bar variant="nav"): site-kit renders on the server too and does not import
          @booqy/brand. Accepted exception for Run 1, docs/adr/DECISIONS.md 2026-11-03. */}
      <nav className="bq-bar bq-bar--nav bq-bar--horizontal builder-site-nav" aria-label="Webbplatsens sidor">
        <ul className="bq-bar__items" data-bq-glide="bare">
          {doc.nav.map((n) => {
            const target = doc.pages.find((p) => p.id === n.pageId)
            if (!target) return null
            const current = target.id === page.id ? 'page' : undefined
            return (
              <li key={n.pageId}>
                {onOpenPage
                  ? <button type="button" className="bq-bar__item" aria-current={current} onClick={() => onOpenPage(target.id)}>{target.title}</button>
                  : <a className="bq-bar__item" href={`/${target.slug}`} aria-current={current}>{target.title}</a>}
              </li>
            )
          })}
        </ul>
      </nav>
      {/* CustomerLayout already has the page's <main>. */}
      <div className="builder-site-blocks">
        {page.blocks.map((block) => <Block key={block.id} doc={doc} block={block} imageBase={imageBase} live={live} onOpenPage={onOpenPage} />)}
      </div>
      {doc.footer.text ? <footer className="page-prose"><p>{doc.footer.text}</p></footer> : null}
    </div>
  )
}
