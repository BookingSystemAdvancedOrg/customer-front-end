import { afterEach, describe, expect, it } from 'vitest'
import { configureSiteKit } from '../../config'
import { paymentAppearance, paymentFonts, withAlpha } from './appearance'

afterEach(() => {
  document.documentElement.removeAttribute('style')
})

describe('paymentAppearance', () => {
  it('prints Stripe in the site tokens, light', () => {
    const a = paymentAppearance('light')
    expect(a.theme).toBe('stripe')
    expect(a.variables).toMatchObject({
      colorBackground: '#fbfaf6',
      colorText: '#1c1918',
      colorPrimary: '#350001',
      borderRadius: '3px',
    })
    expect(a.variables?.fontFamily).toMatch(/^Archivo/)
    expect(a.rules?.['.Label']).toMatchObject({ textTransform: 'uppercase', fontFamily: expect.stringMatching(/Martian Mono/) })
  })

  it('follows dark mode', () => {
    const a = paymentAppearance('dark')
    expect(a.theme).toBe('stripe')
    expect(a.variables).toMatchObject({ colorBackground: '#2a2523', colorText: '#f6ece9' })
  })

  it("uses the restaurant's colour and skips values Stripe can't read", () => {
    document.documentElement.style.setProperty('--accent', '#0b6e4f')
    document.documentElement.style.setProperty('--surface', 'color-mix(in srgb, red 10%, white)')
    const a = paymentAppearance('light')
    expect(a.variables?.colorPrimary).toBe('#0b6e4f')
    expect(a.variables?.colorBackground).toBe('#fbfaf6')
  })
})

describe('helpers', () => {
  it('turns hex into rgba', () => {
    expect(withAlpha('#9e1d26', 0.35)).toBe('rgba(158, 29, 38, 0.35)')
    expect(withAlpha('rgba(1, 2, 3, 0.5)', 0.35)).toBe('rgba(1, 2, 3, 0.5)')
  })

  it("loads the site's own font files, absolute", () => {
    configureSiteKit({ paymentFonts: { sans: '/assets/archivo.woff2', mono: '/assets/martian-mono.woff2' } })
    const fonts = paymentFonts()
    expect(new Set(fonts.map((f) => f.family))).toEqual(new Set(['Archivo', 'Martian Mono']))
    for (const f of fonts) expect(f.src).toMatch(/^url\(http/)
  })
})
