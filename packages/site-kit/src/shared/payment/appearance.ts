import type { Appearance, CustomFontSource } from '@stripe/stripe-js'
import { siteKitConfig } from '../../config'
import type { Theme } from '../theme'

/**
 * Stripes betalformulär (Payment Element) i sajtens eget tryck: papper och
 * tryckfärg, sajtens accent och fältens hörn, bakgrund, kant och fokusring
 * (--field-radius, --field-bg, --field-border, --focus; utan dem kvittots
 * 3 px hörn), sajtens sans i fälten (paymentFonts.sansFamily, annars
 * Archivo) och Martian Mono i etiketterna som på kvittona. Formuläret
 * ligger i Stripes iframes, så värdena läses ur sajtens CSS-variabler här
 * och skickas färdiga - och läses om när ljust/mörkt läge byts (theme).
 *
 * Typsnitten är sajtens egna filer (configureSiteKit paymentFonts) (inga anrop till Google Fonts med
 * gästens IP); CloudFront svarar med CORS för js.stripe.com så att
 * iframen får ladda dem.
 */

const SANS_TAIL = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
const MONO = "'Martian Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

/** Ljusa och mörka värden om CSS-variablerna inte går att läsa (tester). */
const FALLBACK: Record<Theme, Record<string, string>> = {
  light: {
    '--surface': '#ffffff',
    '--fill': '#f6f1ea',
    '--ink': '#1a120e',
    '--muted': '#4a4a46',
    '--line': '#e3d6c4',
    '--accent': '#1a120e',
    '--danger': '#9e1d26',
    '--ok': '#2c6a3f',
    '--ink-red': '#9e1d26',
  },
  dark: {
    '--surface': '#2a1d16',
    '--fill': '#3a2418',
    '--ink': '#f6f1ea',
    '--muted': '#d5c4ae',
    '--line': '#4a3326',
    '--accent': '#f6f1ea',
    '--danger': '#ee8a90',
    '--ok': '#7cc695',
    '--ink-red': '#ee8a90',
  },
}

/** Bara enkla färger (hex, rgb) går att skicka till Stripe. */
const PLAIN = /^(#[0-9a-f]{3,8}|rgba?\([^()]*\))$/i

function reader(theme: Theme) {
  const css = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null
  return (name: string) => {
    const value = css?.getPropertyValue(name).trim() ?? ''
    return PLAIN.test(value) ? value : FALLBACK[theme][name]
  }
}

/** Ett mått (t.ex. 12px) ur sajtens CSS-variabler, annars reservvärdet. */
function length(name: string, fallback: string): string {
  const css = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null
  const value = css?.getPropertyValue(name).trim() ?? ''
  return /^\d+(\.\d+)?px$/.test(value) ? value : fallback
}

/** #9e1d26 + 0.35 -> rgba(158, 29, 38, 0.35); andra format oförändrade. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) return color
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function absolute(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

/** Sajtens egna typsnitt för Stripes iframes (variabla filer, en vikt per post). */
export function paymentFonts(): CustomFontSource[] {
  const { sans, sansFamily = 'Archivo', mono } = siteKitConfig().paymentFonts ?? {}
  const sansSrc = sans && `url(${absolute(sans)}) format('woff2')`
  const martian = mono && `url(${absolute(mono)}) format('woff2')`
  return [
    ...(sansSrc ? ['400', '500', '700', '800'].map((weight) => ({ family: sansFamily, src: sansSrc, weight, display: 'swap' })) : []),
    ...(martian ? ['500', '760'].map((weight) => ({ family: 'Martian Mono', src: martian, weight, display: 'swap' })) : []),
  ]
}

export function paymentAppearance(theme: Theme): Appearance {
  const read = reader(theme)
  const surface = read('--surface')
  const fill = read('--fill')
  const ink = read('--ink')
  const muted = read('--muted')
  const line = read('--line')
  const danger = read('--danger')
  const ownFocus = read('--focus')
  const focus = ownFocus && PLAIN.test(ownFocus) ? ownFocus : withAlpha(theme === 'dark' ? read('--accent') : read('--ink-red'), 0.35)
  const sansFamily = siteKitConfig().paymentFonts?.sansFamily ?? 'Archivo'
  const fieldBg = read('--field-bg') ?? fill
  const fieldRadius = length('--field-radius', '3px')
  const fieldBorder = length('--field-border', '1.5px')
  const label = {
    fontFamily: MONO,
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  }

  return {
    // En bas för båda lägena: Stripe byter inte bastema när läget ändras medan
    // formuläret är öppet, så alla färger sätts här i stället.
    theme: 'stripe',
    labels: 'above',
    variables: {
      fontFamily: `${/\s/.test(sansFamily) ? `'${sansFamily}'` : sansFamily}, ${SANS_TAIL}`,
      fontSizeBase: '16px',
      fontWeightNormal: '400',
      fontWeightMedium: '500',
      fontWeightBold: '700',
      colorPrimary: read('--accent'),
      colorBackground: surface,
      colorText: ink,
      colorTextSecondary: muted,
      colorTextPlaceholder: muted,
      colorDanger: danger,
      colorSuccess: read('--ok'),
      iconColor: muted,
      borderRadius: fieldRadius,
      spacingUnit: '4px',
      gridRowSpacing: '14px',
      focusBoxShadow: `0 0 0 3px ${focus}`,
      focusOutline: 'none',
    },
    rules: {
      '.Label': { ...label, color: muted, marginBottom: '6px' },
      '.Input': {
        backgroundColor: fieldBg,
        border: `${fieldBorder} solid ${line}`,
        boxShadow: 'none',
        color: ink,
      },
      '.Input:focus': { borderColor: ink, boxShadow: `0 0 0 3px ${focus}` },
      '.Input--invalid': { borderColor: danger, boxShadow: 'none' },
      '.Error': { fontFamily: MONO, fontSize: '12px', color: danger },
      '.Tab': {
        backgroundColor: surface,
        border: `${fieldBorder} solid ${line}`,
        boxShadow: 'none',
        color: muted,
      },
      '.Tab:hover': { borderColor: muted, color: ink },
      '.Tab--selected': { backgroundColor: fill, border: `${fieldBorder} solid ${ink}`, boxShadow: 'none', color: ink },
      '.Tab--selected:hover': { borderColor: ink, color: ink },
      '.Tab:focus': { boxShadow: `0 0 0 3px ${focus}` },
      '.TabLabel': { ...label, fontSize: '11px' },
      '.TabIcon': { fill: muted },
      '.TabIcon--selected': { fill: ink },
      '.Block': { backgroundColor: fill, border: `1.5px dashed ${line}`, boxShadow: 'none' },
      '.AccordionItem': { backgroundColor: surface, border: `1.5px dashed ${line}`, boxShadow: 'none' },
      '.AccordionItem--selected': { borderColor: ink, borderStyle: 'solid' },
      '.TermsText': { color: muted, fontSize: '13px' },
    },
  }
}
