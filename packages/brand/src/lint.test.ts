import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { globToRegExp, lintText, run } from '../scripts/brand-lint.mjs'

const rules = (text: string, file: string) => lintText(text, file).map((f) => f.rule)

describe('brand-lint', () => {
  it('finds hard-coded colours, spacing, radii, durations and keyframes in CSS', () => {
    const css = '.x {\n  color: #a88462;\n  padding: 12px;\n  border-radius: 14px;\n  transition: opacity 200ms ease;\n}\n@keyframes spin { to { rotate: 1turn } }\n'
    expect(rules(css, 'a.css')).toEqual(['colour', 'spacing', 'radius', 'duration', 'keyframes'])
  })

  it('accepts tokens', () => {
    const css = '.x {\n  color: var(--bq-ink);\n  padding: var(--bq-space-3);\n  border-radius: var(--bq-radius-card);\n  transition: opacity var(--bq-duration-fast) var(--bq-ease-out);\n}\n'
    expect(rules(css, 'a.css')).toEqual([])
  })

  it('finds hand-rolled bars and duplicates of catalogue components in TSX', () => {
    const tsx = [
      'export function Modal() {',
      '  return <div className="busy-bar"><progress value={1} /></div>',
      '}',
      'const ok = <div className="bq-bar bq-bar--busy" />',
    ].join('\n')
    expect(rules(tsx, 'Page.tsx')).toEqual(['duplicate', 'bar'])
    expect(rules('<div role="tablist">', 'Tabs.tsx')).toEqual(['bar'])
    expect(rules('export const Chip = () => null', 'StatusChip.tsx')).toEqual(['duplicate'])
    expect(rules('export function installPress() {}', 'press.ts')).toEqual(['duplicate'])
  })

  it('ignores comments, links and data URIs', () => {
    expect(rules('// #fff is the paper\n<a href="#top">Upp</a>\n.x { background: url("data:image/svg+xml,%23fff") }', 'a.tsx')).toEqual([])
  })

  it('globs: ** spans folders, * stays in one name', () => {
    expect(globToRegExp('src/features/meta-ads/**').test('src/features/meta-ads/wizard/Step.tsx')).toBe(true)
    expect(globToRegExp('src/*.css').test('src/a/b.css')).toBe(false)
  })

  it('report-only by default, blocking only for the listed globs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brand-lint-'))
    mkdirSync(join(dir, 'src/features/new'), { recursive: true })
    mkdirSync(join(dir, 'src/old'), { recursive: true })
    writeFileSync(join(dir, 'src/old/a.css'), '.a { color: #fff; }\n')
    writeFileSync(join(dir, 'src/features/new/b.css'), '.b { padding: var(--bq-space-2); }\n')
    expect(run({ paths: [join(dir, 'src')] }).blocking).toEqual([])
    expect(run({ paths: [join(dir, 'src')], block: ['features/new/**'] }).blocking).toEqual([])
    writeFileSync(join(dir, 'src/features/new/c.css'), '.c { margin: 8px; }\n')
    const result = run({ paths: [join(dir, 'src')], block: ['features/new/**'] })
    expect(result.blocking.map((f) => f.rule)).toEqual(['spacing'])
    expect(result.apps[0].counts.colour).toBe(1)
  })
})
