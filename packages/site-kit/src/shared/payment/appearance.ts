import type { Appearance, CustomFontSource } from '@stripe/stripe-js'
import { siteKitConfig } from '../../config'
import type { Theme } from '../theme'

/**
 * Stripes betalformulär (Payment Element) i sajtens eget tryck: papper och
 * tryckfärg, restaurangens färg, 3 px hörn, Archivo i fälten och Martian
 * Mono i etiketterna som på kvittona. Formuläret ligger i Stripes iframes,
 * så färgerna läses ur sajtens CSS-variabler här och skickas som färdiga
 * värden - och läses om när ljust/mörkt läge byts (theme i anropet).
 *
 * Typsnitten är sajtens egna filer (configureSiteKit paymentFonts) (inga anrop till Google Fonts med
 * gästens IP); CloudFront svarar med CORS för js.stripe.com så att
 * iframen får ladda dem.
 */

const SANS = "Archivo, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
const MONO = "'Martian Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

/** Ljusa och mörka värden om CSS-variablerna inte går att läsa (tester). */
const FALLBACK: Record<Theme, Record<string, string>> = {
  light: {
    '--surface': '#fbfaf6',
    '--fill': '#f1eee6',
    '--ink': '#1c1918',
    '--muted': '#57504d',
    '--line': '#d9d4c8',
    '--accent': '#350001',
    '--danger': '#9e1d26',
    '--ok': '#2c6a3f',
    '--ink-red': '#9e1d26',
  },
  dark: {
    '--surface': '#2a2523',
    '--fill': '#332e2b',
    '--ink': '#f6ece9',
    '--muted': '#b8aca6',
    '--line': 'rgba(255, 255, 255, 0.14)',
    '--accent': '#b88f8a',
    '--danger': '#e0686f',
    '--ok': '#7cc695',
    '--ink-red': '#e0686f',
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
  const { sans, mono } = siteKitConfig().paymentFonts ?? {}
  const archivo = sans && `url(${absolute(sans)}) format('woff2')`
  const martian = mono && `url(${absolute(mono)}) format('woff2')`
  return [
    ...(archivo ? ['400', '500', '700', '800'].map((weight) => ({ family: 'Archivo', src: archivo, weight, display: 'swap' })) : []),
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
  const focus = withAlpha(theme === 'dark' ? read('--accent') : read('--ink-red'), 0.35)
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
      fontFamily: SANS,
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
      borderRadius: '3px',
      spacingUnit: '4px',
      gridRowSpacing: '14px',
      focusBoxShadow: `0 0 0 3px ${focus}`,
      focusOutline: 'none',
    },
    rules: {
      '.Label': { ...label, color: muted, marginBottom: '6px' },
      '.Input': {
        backgroundColor: fill,
        border: `1.5px solid ${line}`,
        boxShadow: 'none',
        color: ink,
      },
      '.Input:focus': { borderColor: ink, boxShadow: `0 0 0 3px ${focus}` },
      '.Input--invalid': { borderColor: danger, boxShadow: 'none' },
      '.Error': { fontFamily: MONO, fontSize: '12px', color: danger },
      '.Tab': {
        backgroundColor: surface,
        border: `1.5px solid ${line}`,
        boxShadow: 'none',
        color: muted,
      },
      '.Tab:hover': { borderColor: muted, color: ink },
      '.Tab--selected': { backgroundColor: fill, border: `1.5px solid ${ink}`, boxShadow: 'none', color: ink },
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
