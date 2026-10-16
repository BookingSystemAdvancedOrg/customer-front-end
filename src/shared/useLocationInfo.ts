import { businessHoursToRows, specialDayRows } from './locationApi'
import type { OpeningHoursRow, SpecialDayRow } from './locationApi'
import { useSite } from './SiteContext'

export interface LocationInfo {
  locationId: string
  name: string
  address: string
  phone: string
  email: string
  openingHours: OpeningHoursRow[]
  /** Avvikande dagar de närmaste 60 dagarna. */
  specialDays: SpecialDayRow[]
}

/**
 * Den valda platsens visningsuppgifter (namn, adress, kontakt, öppettider)
 * - alltid restaurangens egna, från GET /site-config. Saknas ett fält visas
 * det tomt, aldrig en annan restaurangs uppgifter.
 */
export function useLocationInfo(): LocationInfo {
  const { config, location } = useSite()
  return {
    locationId: location.locationId,
    name: location.name || config.tenant.name,
    address: location.address ?? '',
    phone: location.phoneNumber ?? config.legal.contactPhone ?? '',
    email: location.email ?? config.legal.contactEmail ?? '',
    openingHours: businessHoursToRows(location.businessHours ?? {}),
    specialDays: specialDayRows(location.specialDays ?? []),
  }
}
