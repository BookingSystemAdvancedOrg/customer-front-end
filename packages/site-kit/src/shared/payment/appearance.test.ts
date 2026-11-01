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
      colorBackground: '#ffffff',
      colorText: '#1a120e',
      colorPrimary: '#1a120e',
      borderRadius: '3px',
    })
    expect(a.variables?.fontFamily).toMatch(/^Archivo/)
    expect(a.rules?.['.Label']).toMatchObject({ textTransform: 'uppercase', fontFamily: expect.stringMatching(/Martian Mono/) })
  })

  it('follows dark mode', () => {
    const a = paymentAppearance('dark')
    expect(a.theme).toBe('stripe')
    expect(a.variables).toMatchObject({ colorBackground: '#2a1d16', colorText: '#f6f1ea' })
  })

  it("takes the site's field tokens and sans when they are set", () => {
    document.documentElement.style.setProperty('--field-radius', '12px')
    document.documentElement.style.setProperty('--field-border', '1px')
    document.documentElement.style.setProperty('--field-bg', '#ffffff')
    document.documentElement.style.setProperty('--focus', 'rgba(168, 132, 98, 0.45)')
    configureSiteKit({ paymentFonts: { sans: '/a.woff2', sansFamily: 'Plus Jakarta Sans', mono: '/m.woff2' } })
    const a = paymentAppearance('light')
    expect(a.variables?.borderRadius).toBe('12px')
    expect(a.variables?.fontFamily).toMatch(/^'Plus Jakarta Sans'/)
    expect(a.variables?.focusBoxShadow).toBe('0 0 0 3px rgba(168, 132, 98, 0.45)')
    expect(a.rules?.['.Input']).toMatchObject({ backgroundColor: '#ffffff', border: '1px solid #e3d6c4' })
    expect(paymentFonts().map((f) => f.family)).toContain('Plus Jakarta Sans')
    configureSiteKit({ paymentFonts: undefined })
  })

  it("uses the restaurant's colour and skips values Stripe can't read", () => {
    document.documentElement.style.setProperty('--accent', '#0b6e4f')
    document.documentElement.style.setProperty('--surface', 'color-mix(in srgb, red 10%, white)')
    const a = paymentAppearance('light')
    expect(a.variables?.colorPrimary).toBe('#0b6e4f')
    expect(a.variables?.colorBackground).toBe('#ffffff')
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
