import { useEffect, useState } from 'react'
import { apiPost } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { siteKitConfig } from '../../config'
import { Menu } from '../meny/Menu'
import { SitePage } from './SitePage'
import type { SiteDocument } from './siteSchema'

/**
 * /forhandsvisning#<token>: the owner's draft behind a private link. The
 * token stays in the fragment (never sent as a URL, never stored) and is
 * posted in the body. Never indexed.
 */
export default function PreviewPage() {
  const { config } = useSite()
  const [doc, setDoc] = useState<SiteDocument | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [pageId, setPageId] = useState<string | null>(null)

  useEffect(() => {
    const token = window.location.hash.replace(/^#/, '')
    if (!token) {
      setState('missing')
      return
    }
    let cancelled = false
    apiPost<{ doc: SiteDocument }>('/public/site-builder/preview', { tenantId: config.tenant.tenantId, token })
      .then(
        (out) => { if (!cancelled) { setDoc(out.doc); setState('ready') } },
        () => { if (!cancelled) setState('missing') },
      )
    return () => { cancelled = true }
  }, [config.tenant.tenantId])

  const page = doc ? doc.pages.find((p) => p.id === pageId) ?? doc.pages.find((p) => p.slug === '') ?? doc.pages[0] : null
  return (
    <>
      <meta name="robots" content="noindex" />
      {state !== 'ready' || !doc || !page ? (
        <section className="page-hero page-prose">
          <h1>Förhandsvisning</h1>
          <p>{state === 'loading' ? 'Hämtar förhandsvisningen…' : 'Länken fungerar inte längre. Be om en ny länk.'}</p>
        </section>
      ) : (
        <>
          <p className="page-lede" role="status">Förhandsvisning av utkastet. Gästerna ser det först när det publiceras.</p>
          <nav aria-label="Sidor i förhandsvisningen">
            <ul>
              {doc.pages.map((p) => (
                <li key={p.id}>
                  <button type="button" className="btn btn-secondary btn-small" aria-pressed={p.id === page.id} onClick={() => setPageId(p.id)}>
                    {p.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <SitePage doc={doc} page={page} imageBase={siteKitConfig().menuImageBaseUrl ?? ''} live={{ menu: () => <Menu /> }} />
        </>
      )}
    </>
  )
}
