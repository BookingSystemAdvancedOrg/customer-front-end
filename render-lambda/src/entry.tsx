import { renderToString } from 'react-dom/server'
import { SitePage } from '../../packages/site-kit/src/features/site-builder/SitePage'
import type { SiteDocument, SitePage as Page } from '../../packages/site-kit/src/features/site-builder/siteSchema'

/** HTML of one page, as site-kit draws it (live blocks: their links). */
export function renderPage(doc: SiteDocument, page: Page, imageBase: string): string {
  return renderToString(<SitePage doc={doc} page={page} imageBase={imageBase} />)
}
