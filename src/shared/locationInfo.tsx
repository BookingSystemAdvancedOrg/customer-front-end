import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { isApiConfigured } from './api'
import { isLocationConfigured, LOCATION_ID } from './config'
import { LOCATION_INFO_FALLBACK, LocationInfoContext } from './LocationInfoContext'
import type { LocationInfoState } from './LocationInfoContext'
import { businessHoursToRows, getPublicLocationInfo } from './locationApi'
import { RESTAURANT } from './restaurant'

export function LocationInfoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LocationInfoState>(LOCATION_INFO_FALLBACK)

  useEffect(() => {
    if (!isApiConfigured() || !isLocationConfigured() || !LOCATION_ID) return
    let cancelled = false
    getPublicLocationInfo(LOCATION_ID)
      .then((info) => {
        if (cancelled) return
        setState({
          name: info.name || RESTAURANT.name,
          address: info.address || RESTAURANT.address,
          phone: info.phoneNumber || RESTAURANT.phone,
          email: info.email || RESTAURANT.email,
          openingHours: businessHoursToRows(info.businessHours),
          loading: false,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Platsinformationen kunde inte hämtas just nu.',
        }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <LocationInfoContext.Provider value={state}>
      {children}
    </LocationInfoContext.Provider>
  )
}
