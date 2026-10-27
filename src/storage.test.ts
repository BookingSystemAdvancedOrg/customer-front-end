import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STORAGE_REGISTRY } from '@booqy/site-kit'

describe('index.html', () => {
  it('loads no third-party script that the storage registry (cookie page) does not mention', () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
    const scriptHosts = (html.match(/script-src[^;"]*/)?.[0] ?? '').match(/https:\/\/[^\s;]+/g) ?? []
    const known = STORAGE_REGISTRY.map((e) => e.setBy.toLowerCase()).join(' ')
    expect(scriptHosts.length).toBeGreaterThan(0)
    for (const host of scriptHosts) {
      const vendor = host.includes('stripe') ? 'stripe' : host.includes('cloudflare') ? 'cloudflare' : host
      expect(known, host).toContain(vendor)
    }
  })
})
