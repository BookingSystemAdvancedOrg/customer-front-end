import { describe, expect, it } from 'vitest'
import { generate, readTokens } from '../scripts/build-tokens.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tokens } from './generated/tokens'

const root = join(__dirname, '..')

function lum(hex: string) {
  const v = hex.replace('#', '')
  const rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('tokens', () => {
  it('generated files match tokens.json (run npm run tokens)', () => {
    const files = generate(readTokens())
    for (const [file, content] of Object.entries(files)) expect(readFileSync(join(root, file), 'utf8'), file).toBe(content)
  })

  // Every text pair the components use, in both modes: at least 4.5:1 (WCAG 1.4.3).
  const TEXT_PAIRS: [string, string][] = [
    ['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'], ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
    ['on-accent', 'accent'], ['on-accent', 'accent-hover'], ['accent-ink', 'surface'], ['accent-ink', 'bg'], ['on-brand', 'brand'],
    ['danger', 'surface'], ['success', 'surface'], ['warning', 'surface'], ['surface', 'danger'],
    ['info-ink', 'info-bg'], ['success-ink', 'success-bg'], ['warning-ink', 'warning-bg'], ['danger-ink', 'danger-bg'],
  ]
  for (const mode of ['light', 'dark'] as const) {
    it.each(TEXT_PAIRS)(`${mode}: %s on %s reaches 4.5:1`, (fg, bg) => {
      const c = tokens.color[mode] as Record<string, string>
      expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5)
    })
    // UI parts against their background (WCAG 1.4.11): fills of bars and charts
    it.each([['chart-1', 'surface-2'], ['chart-3', 'surface-2'], ['chart-4', 'surface-2'], ['accent', 'bg']])(`${mode}: %s on %s reaches 3:1`, (fg, bg) => {
      const c = tokens.color[mode] as Record<string, string>
      expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(3)
    })
  }

  it('the restaurant theme falls back to the Booqy values', () => {
    expect(tokens.restaurant.light.accent).toBe(`var(--tenant-accent, ${tokens.color.light.accent})`)
    expect(tokens.restaurant.dark['on-accent']).toBe(`var(--tenant-on-accent-dark, ${tokens.color.dark['on-accent']})`)
  })

  it('the corner scale is the unified one', () => {
    expect(tokens.radius).toEqual({ inner: '14px', card: '22px', panel: '28px', pill: '9999px', round: '50%' })
  })
})
