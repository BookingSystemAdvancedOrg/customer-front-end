import { describe, expect, it } from 'vitest'
import { accentPair, deepenForLight, liftForDark, textOn } from './SiteProvider'

describe('textOn', () => {
  it('uses white on dark colours and near-black on light ones', () => {
    expect(textOn('#350001')).toBe('#ffffff')
    expect(textOn('#0071e3')).toBe('#ffffff')
    expect(textOn('#e8d4b8')).toBe('#1d1a1a')
    expect(textOn('#fff')).toBe('#1d1a1a')
  })

  it('falls back to white for values that are not hex colours', () => {
    expect(textOn('red')).toBe('#ffffff')
  })
})

describe('liftForDark', () => {
  it('lightens a dark brand colour until it is visible on the dark surface', () => {
    const lifted = liftForDark('#350001', 4.5)
    expect(lifted).not.toBe('#350001')
    expect(lifted).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('keeps colours that already have enough contrast', () => {
    expect(liftForDark('#ffd60a', 3)).toBe('#ffd60a')
  })

  it('leaves invalid input untouched', () => {
    expect(liftForDark('not-a-colour', 3)).toBe('not-a-colour')
  })
})

describe('deepenForLight', () => {
  it('darkens a light brand colour until it reads as text on paper', () => {
    const deepened = deepenForLight('#c9a24a', 4.5)
    expect(deepened).not.toBe('#c9a24a')
    expect(deepened).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('keeps colours that already have enough contrast', () => {
    expect(deepenForLight('#350001', 4.5)).toBe('#350001')
  })

  it('leaves invalid input untouched', () => {
    expect(deepenForLight('not-a-colour', 4.5)).toBe('not-a-colour')
  })
})

describe('accentPair', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

  it('keeps a readable brand colour as it is in light mode', () => {
    expect(accentPair('#350001', 'light')).toEqual({ accent: '#350001', onAccent: '#ffffff' })
    expect(accentPair('#ffd60a', 'light')).toEqual({ accent: '#ffd60a', onAccent: '#1d1a1a' })
  })

  it('nudges a mid-tone until its text reads, in both modes', () => {
    for (const hex of ['#578374', '#1f5a46', '#0071e3', '#c9a24a', '#777777']) {
      for (const mode of ['light', 'dark'] as const) {
        const { accent, onAccent } = accentPair(hex, mode)
        expect(ratio(accent, onAccent), `${hex} ${mode}`).toBeGreaterThanOrEqual(4.5)
        if (mode === 'dark') expect(ratio(accent, '#2a2523'), `${hex} fill`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('leaves invalid input untouched', () => {
    expect(accentPair('nope', 'light')).toEqual({ accent: 'nope', onAccent: '#ffffff' })
  })
})
