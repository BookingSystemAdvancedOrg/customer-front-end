import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageHtml, scriptJson, versionObjects, versionPrefix } from '../src/render.mjs'

const template = '<!doctype html><html><head><title>Booqy</title><script type="module" src="/assets/index-abc.js"></script>' +
  '<link rel="stylesheet" href="/assets/index-def.css"></head><body><div id="root"></div></body></html>'
const doc = {
  schemaVersion: 1, theme: { primaryColor: '#350001', accentColor: '#350001', font: 'serif' }, footer: { text: 'x' },
  nav: [{ pageId: 'start' }, { pageId: 'om' }],
  pages: [
    { id: 'start', slug: '', title: 'Hem', seo: { title: 'Bistro A', description: 'Mat & "dryck"' }, blocks: [] },
    { id: 'om', slug: 'om-oss', title: 'Om oss', seo: { title: 'Om oss', description: '' }, blocks: [{ id: 't', type: 'text', body: '</script><script>alert(1)</script>' }] },
  ],
}
const render = (d, page) => `<main>${page.title}</main>`
const assets = [{ name: 'index-abc.js', body: 'js', contentType: 'text/javascript' }, { name: '../evil', body: '', contentType: 'x' }]

test('every key is under the version prefix of the given tenant', () => {
  const objects = versionObjects({ tenantId: 'T1', versionNo: 3, doc, template, assets, renderPage: render, imageBase: '' })
  assert.deepEqual(objects.map((o) => o.key), [
    'sites/T1/v/3/index.html', 'sites/T1/v/3/om-oss/index.html', 'sites/T1/v/3/site.json', 'sites/T1/v/3/assets/index-abc.js'])
  assert.ok(objects.every((o) => o.cacheControl.includes('immutable')))
})

test('a bad tenant id or version never makes a key', () => {
  assert.throws(() => versionPrefix('../T2', 1))
  assert.throws(() => versionPrefix('T1', 0))
  assert.throws(() => versionPrefix('T1', 1.5))
})

test('pages reference only their own version assets, carry the page and the document', () => {
  const html = pageHtml(template, { html: '<main>Hem</main>', doc, page: doc.pages[0], versionNo: 3 })
  assert.match(html, /src="\/v\/3\/assets\/index-abc\.js"/)
  assert.match(html, /href="\/v\/3\/assets\/index-def\.css"/)
  assert.doesNotMatch(html, /"\/assets\//)
  assert.match(html, /<div id="root"><main>Hem<\/main><\/div>/)
  assert.match(html, /<title>Bistro A<\/title>/)
  assert.match(html, /<meta name="description" content="Mat &amp; &quot;dryck&quot;">/)
})

test('the embedded document cannot close its script tag', () => {
  const html = pageHtml(template, { html: '', doc, page: doc.pages[1], versionNo: 1 })
  const embedded = html.slice(html.indexOf('id="booqy-site"'))
  assert.equal((embedded.match(/<\/script>/g) || []).length, 1)
  assert.deepEqual(JSON.parse(scriptJson(doc)), doc)
})
