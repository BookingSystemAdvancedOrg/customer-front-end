// Pure part of the render Lambda: from a site document, the customer app's
// index.html and its built assets, the S3 objects of one version. Every key
// is under sites/<tenantId>/v/<versionNo>/, and every page references only
// its own version's assets (ADR-B 3), so promotion never mixes versions.

export const IMMUTABLE = 'public, max-age=31536000, immutable'
export const EMBED_ID = 'booqy-site'

const TENANT = /^[A-Za-z0-9_-]{1,64}$/

export function versionPrefix(tenantId, versionNo) {
  if (!TENANT.test(String(tenantId)) || !Number.isInteger(versionNo) || versionNo < 1) {
    throw new Error('invalid tenant or version')
  }
  return `sites/${tenantId}/v/${versionNo}/`
}

/** JSON safe inside <script>: no "</script>", no HTML comment openers, no line separators. */
export function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The app's index.html with the page drawn in, the document embedded and asset URLs moved to the version. */
export function pageHtml(template, { html, doc, page, versionNo }) {
  const assetBase = `/v/${versionNo}/assets/`
  let out = template.replace(/(["'(])\/assets\//g, `$1${assetBase}`)
  const title = page.seo?.title || page.title
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
  if (page.seo?.description) {
    out = out.replace('</head>', `<meta name="description" content="${escapeHtml(page.seo.description)}">\n</head>`)
  }
  const root = /<div id="root"><\/div>/
  if (!root.test(out)) throw new Error('template has no <div id="root"></div>')
  return out.replace(root, `<div id="root">${html}</div>\n<script id="${EMBED_ID}" type="application/json">${scriptJson(doc)}</script>`)
}

/**
 * [{key, body, contentType, cacheControl}] for one version.
 * assets: [{name, body, contentType}] from the app's dist/assets.
 */
export function versionObjects({ tenantId, versionNo, doc, template, assets, renderPage, imageBase }) {
  const prefix = versionPrefix(tenantId, versionNo)
  const objects = []
  for (const page of doc.pages) {
    const html = renderPage(doc, page, imageBase)
    objects.push({
      key: `${prefix}${page.slug ? `${page.slug}/` : ''}index.html`,
      body: pageHtml(template, { html, doc, page, versionNo }),
      contentType: 'text/html; charset=utf-8',
      cacheControl: IMMUTABLE,
    })
  }
  objects.push({ key: `${prefix}site.json`, body: JSON.stringify(doc), contentType: 'application/json', cacheControl: IMMUTABLE })
  for (const asset of assets) {
    if (asset.name.includes('/') || asset.name.startsWith('.')) continue
    objects.push({ key: `${prefix}assets/${asset.name}`, body: asset.body, contentType: asset.contentType, cacheControl: IMMUTABLE })
  }
  return objects
}
