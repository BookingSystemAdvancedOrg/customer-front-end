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

function applyBranding(config: SiteConfig): void {
  const { branding, name } = config.tenant
  document.title = name
  const root = document.documentElement.style
  if (branding.primaryColor) {
    root.setProperty('--gold', branding.primaryColor)
    root.setProperty('--accent', branding.primaryColor)
  }
  if (branding.accentColor) root.setProperty('--gold-bright', branding.accentColor)
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
    return <div className="site-boot" role="status" aria-live="polite">Laddar…</div>
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
