import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { siteKitConfig } from '../../config'
import { liveSlots, siteFeatures } from './liveSlots'
import { SitePage, findPage } from './SitePage'
import type { SiteDocument } from './siteSchema'

/** Id of the <script type="application/json"> the render Lambda embeds the document in. */
export const EMBED_ID = 'booqy-site'

/** Only something shaped like a site document is drawn (anything else: the holding text). */
export function asDocument(value: unknown): SiteDocument | null {
  const d = value as Partial<SiteDocument> | null
  return d && d.schemaVersion === 1 && Array.isArray(d.pages) && Array.isArray(d.nav) && d.theme && d.footer
    ? (d as SiteDocument) : null
}

function embedded(): SiteDocument | null {
  const el = typeof document !== 'undefined' ? document.getElementById(EMBED_ID) : null
  if (!el?.textContent) return null
  try {
    return asDocument(JSON.parse(el.textContent))
  } catch {
    return null
  }
}

/** Varje sida på en sajt från webbplatsbyggaren, ritad från det publicerade dokumentet. */
export default function BuilderPage() {
  const { config, location } = useSite()
  const { pathname } = useLocation()
  const [doc, setDoc] = useState<SiteDocument | null>(embedded)
  const version = config.tenant.site?.version ?? 0

  // A tab opened before a new publish: the document is re-read when the version moves on.
  useEffect(() => {
    let cancelled = false
    fetch(`/site.json?v=${version}`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: unknown) => { const valid = asDocument(d); if (!cancelled && valid) setDoc(valid) })
      .catch(() => undefined) // the embedded document (if any) stays
    return () => { cancelled = true }
  }, [version])

  // The render Lambda writes a static <meta name="description"> into <head>. React 19 never adopts
  // a meta tag, so that static one is removed and the tag React renders below (data-booqy) is the only one.
  useEffect(() => {
    document.head.querySelectorAll('meta[name="description"]:not([data-booqy])').forEach((m) => m.remove())
  }, [])

  const page = doc ? findPage(doc, pathname) : null
  if (!doc || !page) {
    return (
      <section className="page-hero page-prose">
        {/* The static index.html <title> is gone after a client navigation: always render one. */}
        <title>{doc ? `Sidan finns inte - ${config.tenant.name}` : config.tenant.name}</title>
        <h1>{config.tenant.name}</h1>
        <p>{doc ? 'Sidan finns inte.' : 'Den här sidan är på väg.'}</p>
      </section>
    )
  }
  return (
    <>
      {/* React 19 hoists these into <head>: the page's own SEO title, never just the restaurant name. */}
      <title>{page.seo.title || page.title}</title>
      {page.seo.description ? <meta name="description" content={page.seo.description} data-booqy="" /> : null}
      <SitePage
        doc={doc}
        page={page}
        imageBase={siteKitConfig().menuImageBaseUrl ?? ''}
        live={liveSlots}
        features={siteFeatures(config)}
        address={location.address ?? ''}
      />
    </>
  )
}
