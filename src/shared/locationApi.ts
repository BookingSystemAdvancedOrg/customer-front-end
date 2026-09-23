import { apiGet, ApiError } from './api'

/**
 * Klient mot backendens PUBLIKA platsinfo-endpoint (openapi.yaml,
 * Locations-taggen):
 *
 *   GET /locations/{id}/public-info - namn, adress, kontakt och
 *   öppettider, ingen inloggning krävs (`security: []`). Kontaktfälten
 *   kan saknas helt på äldre platsposter som föregår dem.
 */

export interface DayHoursRange {
  opensAt: string
  closesAt: string
}

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type BusinessHours = Partial<Record<Weekday, DayHoursRange[]>>

export interface PublicLocationInfo {
  locationId: string
  name: string
  address?: string
  email?: string
  phoneNumber?: string
  timezone: string
  businessHours: BusinessHours
}

function toFriendlyLocationError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new Error('Platsinformationen tog för lång tid att hämta.')
  }
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err : new Error('Ett okänt fel inträffade.')
  }

  console.error(`[LocationInfo] ${err.status}: ${err.message}`)

  switch (err.status) {
    case 404:
      return new ApiError(404, 'Restaurangen kunde inte hittas.')
    case 503:
      return new ApiError(
        503,
        'Platsinformationen är tillfälligt otillgänglig. Försök igen.',
      )
    default:
      return new ApiError(
        err.status,
        'Platsinformationen kunde inte hämtas just nu.',
      )
  }
}

/** Publik platsinfo för en restaurang: namn, adress, kontakt, öppettider. */
export async function getPublicLocationInfo(
  locationId: string,
): Promise<PublicLocationInfo> {
  try {
    return await apiGet<PublicLocationInfo>(
      `/locations/${encodeURIComponent(locationId)}/public-info`,
    )
  } catch (err) {
    throw toFriendlyLocationError(err)
  }
}

const WEEKDAY_ORDER: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: 'Mån',
  tuesday: 'Tis',
  wednesday: 'Ons',
  thursday: 'Tor',
  friday: 'Fre',
  saturday: 'Lör',
  sunday: 'Sön',
}

function formatRanges(ranges: DayHoursRange[] | undefined): string {
  if (!ranges || ranges.length === 0) return 'Stängt'
  return ranges.map((r) => `${r.opensAt}–${r.closesAt}`).join(', ')
}

export interface OpeningHoursRow {
  days: string
  hours: string
}

/**
 * Öppettider per veckodag till visningsrader, med intilliggande dagar som
 * har identiska tider slagna ihop (t.ex. "Mån–Tor" · "11:00–22:00") -
 * samma visningsform som den tidigare hårdkodade listan i restaurant.ts.
 */
export function businessHoursToRows(hours: BusinessHours): OpeningHoursRow[] {
  const days = WEEKDAY_ORDER.map((day) => ({
    day,
    label: formatRanges(hours[day]),
  }))
  const rows: OpeningHoursRow[] = []
  let i = 0
  while (i < days.length) {
    let j = i
    while (j + 1 < days.length && days[j + 1].label === days[i].label) j++
    const daysLabel =
      i === j
        ? WEEKDAY_SHORT[days[i].day]
        : `${WEEKDAY_SHORT[days[i].day]}–${WEEKDAY_SHORT[days[j].day]}`
    rows.push({ days: daysLabel, hours: days[i].label })
    i = j + 1
  }
  return rows
}
