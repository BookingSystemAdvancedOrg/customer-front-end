import { createContext } from 'react'
import type { OpeningHoursRow } from './locationApi'
import { RESTAURANT } from './restaurant'
import { isApiConfigured } from './api'
import { isLocationConfigured } from './config'

/**
 * Liveplatsdata från GET /locations/{id}/public-info, kontextad ovanför
 * kundsajten så header, footer och Om oss delar samma hämtning i stället
 * för en per komponent. Innan svaret kommit (eller om anropet misslyckas)
 * visas restaurant.ts hårdkodade fallback-värden - sajten ska aldrig se
 * tom eller trasig ut bara för att nätverket är långsamt.
 */
export interface LocationInfoState {
  name: string
  address: string
  phone: string
  email: string
  openingHours: OpeningHoursRow[]
  loading: boolean
  error: string | null
}

export const LOCATION_INFO_FALLBACK: LocationInfoState = {
  name: RESTAURANT.name,
  address: RESTAURANT.address,
  phone: RESTAURANT.phone,
  email: RESTAURANT.email,
  openingHours: RESTAURANT.openingHours,
  loading: isApiConfigured() && isLocationConfigured(),
  error: null,
}

export const LocationInfoContext = createContext<LocationInfoState>(
  LOCATION_INFO_FALLBACK,
)
