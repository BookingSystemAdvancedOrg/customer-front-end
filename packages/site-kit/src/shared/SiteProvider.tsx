import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, isApiConfigured } from './api'
import {
  getSiteConfig,
  pickLocation,
  readStoredLocation,
  siteQuery,
  storeLocation,
} from './site'
import type { SiteConfig } from './site'
import { SiteContext } from './SiteContext'

type State =
  | { status: 'loading' }
  | { status: 'ready'; config: SiteConfig }
  | { status: 'unavailable' }
  | { status: 'error' }

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const full = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const toHex = (rgb: [number, number, number]) =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Text på accentfärgen: vit på mörka färger, nästan svart på ljusa (t.ex.
 * guld) - så knappar alltid går att läsa (WCAG-kontrast). */
export function textOn(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return '#ffffff'
  return contrast(rgb, [255, 255, 255]) >= contrast(rgb, [29, 26, 26]) ? '#ffffff' : '#1d1a1a'
}

const WHITE: [number, number, number] = [255, 255, 255]
const NEAR_BLACK: [number, number, number] = [29, 26, 26]
/** Kvittopapperet i mörkt läge: det accentfärgen som fyllning ska stå emot. */
const TICKET_DARK: [number, number, number] = [42, 37, 35]

const mix = (rgb: [number, number, number], to: [number, number, number], t: number) =>
  rgb.map((v, i) => v + (to[i] - v) * t) as [number, number, number]

/** Bästa kontrast någon text (vit eller nästan svart) får på färgen. */
function textContrast(rgb: [number, number, number]): number {
  return Math.max(contrast(rgb, WHITE), contrast(rgb, NEAR_BLACK))
}

/**
 * Restaurangens färg som den används på knappar och bandet, med den text
 * som går att läsa på den. Ljust läge behåller färgen; bara om varken vit
 * eller svart text når 4,5:1 (mellantoner) knuffas den det minsta som
 * behövs. Mörkt läge ljusar upp den tills den som fyllning står emot
 * kvittopapperet (3:1) och texten på den läses (4,5:1).
 */
export function accentPair(hex: string, mode: 'light' | 'dark'): { accent: string; onAccent: string } {
  const rgb = parseHex(hex)
  if (!rgb) return { accent: hex, onAccent: '#ffffff' }
  let best = rgb
  if (mode === 'light') {
    if (textContrast(rgb) < 4.5) {
      for (let t = 0.05; t <= 1.0001; t += 0.05) {
        const darker = mix(rgb, NEAR_BLACK, t)
        const lighter = mix(rgb, WHITE, t)
        if (textContrast(darker) >= 4.5) {
          best = darker
          break
        }
        if (textContrast(lighter) >= 4.5) {
          best = lighter
          break
        }
      }
    }
  } else {
    best = WHITE
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const mixed = mix(rgb, WHITE, t)
      if (contrast(mixed, TICKET_DARK) >= 3 && textContrast(mixed) >= 4.5) {
        best = mixed
        break
      }
    }
  }
  const accent = toHex(best)
  return { accent, onAccent: textOn(accent) }
}

/**
 * Ljusar upp en färg mot vitt tills den når `min` i kontrast mot mörkt
 * läges yta. Mörka märkesfärger (t.ex. Booqys #350001) försvinner
 * annars mot svart bakgrund.
 */
export function liftForDark(hex: string, min: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  // Mot det ljusaste mörka underlaget text ligger på (fälten, #332e2b), inte
  // skrivbordet: annars blir länkar i formulär för svaga.
  const surface: [number, number, number] = [51, 46, 43]
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = rgb.map((v) => v + (255 - v) * t) as [number, number, number]
    if (contrast(mixed, surface) >= min) return toHex(mixed)
  }
  return '#ffffff'
}

/**
 * Mörkar en färg mot tryckfärgsvart tills den når `min` i kontrast mot
 * papperet (#fbfaf6). Ljusa märkesfärger (guld, pastell) går annars inte att
 * läsa som länk- eller rubriktext på papper - knapparna behåller den
 * riktiga färgen, texten får den här.
 */
export function deepenForLight(hex: string, min: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  // Mot pappersskuggan (fälten, #f1eee6) så att texten håller även där.
  const paper: [number, number, number] = [241, 238, 230]
  const black: [number, number, number] = [28, 25, 24]
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = rgb.map((v, i) => v + (black[i] - v) * t) as [number, number, number]
    if (contrast(mixed, paper) >= min) return toHex(mixed)
  }
  return toHex(black)
}

function applyBranding(config: SiteConfig): void {
  const { branding, name } = config.tenant
  document.title = name
  const root = document.documentElement.style
  // Restaurangens färg blir designsystemets enda accent (knappar, länkar,
  // valda bord); hover/fokus-nyanser räknas fram ur den i index.css. Mörkt
  // läge får en uppljusad variant så att färgen syns mot svart.
  // Utan egen färg gäller Booqys standardfärger i index.css.
  if (branding.primaryColor && parseHex(branding.primaryColor)) {
    const color = branding.primaryColor
    const light = accentPair(color, 'light')
    const dark = accentPair(color, 'dark')
    root.setProperty('--tenant-accent', light.accent)
    root.setProperty('--tenant-on-accent', light.onAccent)
    root.setProperty('--tenant-accent-ink', deepenForLight(color, 4.5))
    root.setProperty('--tenant-accent-dark', dark.accent)
    root.setProperty('--tenant-on-accent-dark', dark.onAccent)
    root.setProperty('--tenant-accent-ink-dark', liftForDark(color, 4.5))
  }
  if (branding.faviconUrl) {
    // Restaurangens egen ikon ersätter både Booqys ljusa och mörka
    document.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove())
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = branding.faviconUrl
    document.head.appendChild(link)
  }
}

/**
 * Hämtar restaurangen för den här adressen innan något annat ritas. Okänd
 * eller pausad restaurang visar en neutral "inte tillgänglig"-sida - aldrig
 * någon annan restaurangs innehåll.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const query = useMemo(
    () => siteQuery(window.location.hostname, window.location.search),
    [],
  )
  const [state, setState] = useState<State>(() =>
    !isApiConfigured() || !query ? { status: 'unavailable' } : { status: 'loading' },
  )
  const [locationId, setLocationIdState] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isApiConfigured() || !query) return
    let cancelled = false
    getSiteConfig(query)
      .then((config) => {
        if (cancelled) return
        applyBranding(config)
        setLocationIdState(
          pickLocation(config, readStoredLocation(config.tenant.tenantId))?.locationId ?? null,
        )
        setState({ status: 'ready', config })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const missing = err instanceof ApiError && (err.status === 404 || err.status === 400)
        setState({ status: missing ? 'unavailable' : 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [query, attempt])

  if (state.status === 'loading') {
    return (
      <div className="site-boot">
        <div className="printing" role="status" aria-live="polite" aria-label="Laddar">
          <span className="printing__label">Laddar</span>
          <i /><i /><i /><i />
        </div>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="site-boot">
        <h1>Sidan kunde inte laddas</h1>
        <p>Kontrollera din anslutning och försök igen.</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setState({ status: 'loading' })
            setAttempt((a) => a + 1)
          }}
        >
          Försök igen
        </button>
      </div>
    )
  }
  if (state.status === 'unavailable') {
    return (
      <div className="site-boot">
        <h1>Sidan är inte tillgänglig</h1>
        <p>Den här restaurangens webbplats är inte aktiv just nu.</p>
      </div>
    )
  }

  const { config } = state
  const location = pickLocation(config, locationId)
  if (!location) {
    return (
      <div className="site-boot">
        <h1>{config.tenant.name}</h1>
        <p>Webbplatsen är inte klar ännu - välkommen tillbaka snart.</p>
      </div>
    )
  }

  return (
    <SiteContext.Provider
      value={{
        config,
        location,
        setLocationId: (id: string) => {
          if (!config.locations.some((l) => l.locationId === id)) return
          storeLocation(config.tenant.tenantId, id)
          setLocationIdState(id)
        },
      }}
    >
      {children}
    </SiteContext.Provider>
  )
}
