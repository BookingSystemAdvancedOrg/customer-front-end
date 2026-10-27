import { createContext, useContext } from 'react'
import type { SiteConfig, SiteLocation } from './site'

export interface SiteContextValue {
  config: SiteConfig
  /** Platsen besökaren tittar på (alltid en av restaurangens). */
  location: SiteLocation
  setLocationId: (locationId: string) => void
}

export const SiteContext = createContext<SiteContextValue | null>(null)

/** Restaurangen sajten visar. Finns alltid under <SiteProvider>. */
export function useSite(): SiteContextValue {
  const value = useContext(SiteContext)
  if (!value) throw new Error('useSite kräver <SiteProvider>.')
  return value
}
