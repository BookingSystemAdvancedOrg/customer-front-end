// site-builder-render (ADR-B 3): Step Functions task Render.
//   input  {tenantId, publishId, versionNo}
//   reads  VERSION#<n:06d> of TENANT#<t> from SITE_BUILDER_TABLE_NAME
//   writes sites/<t>/v/<n>/<page>/index.html, site.json, assets/* to SITES_BUCKET_NAME
// The tenant id comes from the workflow input the site-builder API wrote;
// every key is built from it (render.mjs), never from the document.
import { readFile, readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { versionObjects } from './render.mjs'
import { renderPage } from '../dist/entry.mjs'

const APP_DIR = process.env.APP_DIST_DIR || '/var/task/app'
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.wav': 'audio/wav' }

const ddb = new DynamoDBClient({})
const s3 = new S3Client({})
let app = null

async function loadApp() {
  if (app) return app
  const template = await readFile(join(APP_DIR, 'index.html'), 'utf8')
  const names = await readdir(join(APP_DIR, 'assets'))
  const assets = await Promise.all(names.map(async (name) => ({
    name, body: await readFile(join(APP_DIR, 'assets', name)), contentType: TYPES[extname(name)] ?? 'application/octet-stream',
  })))
  app = { template, assets }
  return app
}

export async function handler(event) {
  const { tenantId, versionNo } = event ?? {}
  const n = Number(versionNo)
  const got = await ddb.send(new GetItemCommand({
    TableName: process.env.SITE_BUILDER_TABLE_NAME,
    Key: { PK: { S: `TENANT#${tenantId}` }, SK: { S: `VERSION#${String(n).padStart(6, '0')}` } },
    ConsistentRead: true,
  }))
  if (!got.Item) throw new Error(JSON.stringify({ code: 'not_found' }))
  const version = unmarshall(got.Item)
  const { template, assets } = await loadApp()
  const objects = versionObjects({
    tenantId, versionNo: n, doc: version.doc, template, assets, renderPage,
    imageBase: process.env.MENU_IMAGE_BASE_URL ?? '',
  })
  for (const o of objects) {
    await s3.send(new PutObjectCommand({ Bucket: process.env.SITES_BUCKET_NAME, Key: o.key, Body: o.body,
      ContentType: o.contentType, CacheControl: o.cacheControl }))
  }
  return { tenantId, versionNo: n, objects: objects.length }
}
