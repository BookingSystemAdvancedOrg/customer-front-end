import { useEffect, useState } from 'react'
import { Button, Printing } from '@booqy/brand'
import { apiPost, ApiError } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { siteKitConfig } from '../../config'
import { liveSlots, siteFeatures } from './liveSlots'
import { SitePage } from './SitePage'
import type { SiteDocument } from './siteSchema'

/** Only a refused or unknown token means the link is gone; anything else can be retried. */
function isMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 401 || err.status === 403)
}

/**
 * /forhandsvisning#<token>: the owner's draft behind a private link. The
 * token stays in the fragment (never sent as a URL, never stored) and is
 * posted in the body. Never indexed.
 */
export default function PreviewPage() {
  const { config, location } = useSite()
  const [doc, setDoc] = useState<SiteDocument | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  const [pageId, setPageId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

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
        (err: unknown) => { if (!cancelled) setState(isMissing(err) ? 'missing' : 'failed') },
      )
    return () => { cancelled = true }
  }, [config.tenant.tenantId, attempt])

  const retry = () => {
    setState('loading')
    setAttempt((n) => n + 1)
  }

  // The site's own nav opens draft pages here, never the live /<slug>.
  const openPage = (id: string) => {
    setPageId(id)
    window.scrollTo?.({ top: 0 })
  }
  const page = doc ? doc.pages.find((p) => p.id === pageId) ?? doc.pages.find((p) => p.slug === '') ?? doc.pages[0] : null
  return (
    <>
      <meta name="robots" content="noindex" />
      {state !== 'ready' || !doc || !page ? (
        <section className="page-hero page-prose">
          <h1>Förhandsvisning</h1>
          {state === 'loading' ? (
            <Printing label="Hämtar förhandsvisningen" />
          ) : state === 'failed' ? (
            <>
              <p role="alert">Förhandsvisningen kunde inte hämtas. Kontrollera anslutningen och försök igen.</p>
              <Button variant="primary" onClick={retry}>Försök igen</Button>
            </>
          ) : (
            <p>Länken fungerar inte längre. Be om en ny länk.</p>
          )}
        </section>
      ) : (
        <>
          <header className="builder-preview-head">
            <p className="page-lede builder-preview-note" role="status">Förhandsvisning av utkastet. Gästerna ser det först när det publiceras.</p>
          </header>
          <SitePage
            doc={doc}
            page={page}
            imageBase={siteKitConfig().menuImageBaseUrl ?? ''}
            live={liveSlots}
            features={siteFeatures(config)}
            address={location.address ?? ''}
            onOpenPage={openPage}
          />
        </>
      )}
    </>
  )
}
