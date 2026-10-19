import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STORAGE_REGISTRY } from './storageRegistry'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('storage registry', () => {
  it('lists only strictly necessary storage (no consent banner needed)', () => {
    for (const e of STORAGE_REGISTRY) expect(e.category, e.name).toBe('nödvändig')
  })

  it('describes every entry fully', () => {
    for (const e of STORAGE_REGISTRY) {
      for (const field of [e.name, e.setBy, e.purpose, e.lifetime]) {
        expect(field.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('every file that writes to browser storage takes its key names from the registry', () => {
    const writers = sourceFiles(SRC).filter((file) =>
      /(localStorage|sessionStorage)\.setItem\(|document\.cookie\s*=/.test(readFileSync(file, 'utf8')),
    )
    expect(writers.length).toBeGreaterThan(0)
    for (const file of writers) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).toMatch(/from '[./]*(shared\/)?storageRegistry'/)
      expect(text, file).not.toMatch(/document\.cookie\s*=/)
    }
  })

  it('no third-party script is loaded that the registry does not mention', () => {
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8')
    const scriptHosts = (html.match(/script-src[^;"]*/)?.[0] ?? '').match(/https:\/\/[^\s;]+/g) ?? []
    const known = STORAGE_REGISTRY.map((e) => e.setBy.toLowerCase()).join(' ')
    for (const host of scriptHosts) {
      const vendor = host.includes('stripe') ? 'stripe' : host.includes('cloudflare') ? 'cloudflare' : host
      expect(known, host).toContain(vendor)
    }
  })
})
