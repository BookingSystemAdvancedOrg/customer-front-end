import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STORAGE_REGISTRY, TICKET_PURCHASE_KEY } from './storageRegistry'

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

  it('lists the ticket purchase key (events) as a necessary session entry', () => {
    expect(TICKET_PURCHASE_KEY).toBe('booqy-ticket-purchase')
    const entry = STORAGE_REGISTRY.find((e) => e.name === TICKET_PURCHASE_KEY)
    expect(entry).toMatchObject({
      kind: 'sessionStorage',
      setBy: 'Webbplatsen',
      category: 'nödvändig',
      where: 'Evenemang',
      lifetime: 'Tills köpet är klart eller fliken stängs',
    })
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
})
