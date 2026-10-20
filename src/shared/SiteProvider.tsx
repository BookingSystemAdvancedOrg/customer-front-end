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

/**
 * Ljusar upp en färg mot vitt tills den når `min` i kontrast mot mörkt
 * läges yta (#1c1a1a). Mörka märkesfärger (t.ex. Booqys #350001) försvinner
 * annars mot svart bakgrund.
 */
export function liftForDark(hex: string, min: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const surface: [number, number, number] = [28, 26, 26]
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = rgb.map((v) => v + (255 - v) * t) as [number, number, number]
    if (contrast(mixed, surface) >= min) return toHex(mixed)
  }
  return '#ffffff'
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
    const dark = liftForDark(color, 3)
    root.setProperty('--tenant-accent', color)
    root.setProperty('--tenant-on-accent', textOn(color))
    root.setProperty('--tenant-accent-dark', dark)
    root.setProperty('--tenant-on-accent-dark', textOn(dark))
    root.setProperty('--tenant-accent-ink-dark', liftForDark(color, 4.5))
  }
  if (branding.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = branding.faviconUrl
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
