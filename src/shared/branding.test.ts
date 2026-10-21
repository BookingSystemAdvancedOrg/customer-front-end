import { describe, expect, it } from 'vitest'
import { deepenForLight, liftForDark, textOn } from './SiteProvider'

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
