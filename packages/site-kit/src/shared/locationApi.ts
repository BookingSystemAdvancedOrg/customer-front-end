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
  return ranges.map((r) => `${r.opensAt}-${r.closesAt}`).join(', ')
}

export interface OpeningHoursRow {
  days: string
  hours: string
}

/**
 * Öppettider per veckodag till visningsrader, med intilliggande dagar som
 * har identiska tider slagna ihop (t.ex. "Mån-Tor" · "11:00-22:00") -
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
        : `${WEEKDAY_SHORT[days[i].day]}-${WEEKDAY_SHORT[days[j].day]}`
    rows.push({ days: daysLabel, hours: days[i].label })
    i = j + 1
  }
  return rows
}

/** En avvikande dag som rad i öppettiderna: "tors 24 dec" + "Stängt (Julafton)". */
export interface SpecialDayRow {
  date: string
  label: string
  text: string
}

export function specialDayRows(
  days: { date: string; kind: 'closed' | 'hours' | 'no_online'; intervals?: DayHoursRange[]; note?: string }[],
): SpecialDayRow[] {
  return days.map((d) => {
    const [y, m, day] = d.date.split('-').map(Number)
    const label = new Intl.DateTimeFormat('sv-SE', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, day)))
    const base =
      d.kind === 'closed'
        ? 'Stängt'
        : d.kind === 'hours'
          ? (d.intervals ?? []).map((i) => `${i.opensAt}-${i.closesAt}`).join(', ')
          : 'Vanliga tider, ingen onlinebokning'
    return { date: d.date, label, text: d.note ? `${base} (${d.note})` : base }
  })
}


/* --- Öppet just nu ---------------------------------------------------------- */

export interface OpenStatus {
  open: boolean
  /** "Öppet till 22:00" / "Öppnar 11:00" / "Öppnar tis 11:00" / "Stängt idag". */
  text: string
}

const JS_DAY: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Datum, veckodag och klockslag (HH:MM) i restaurangens tidszon. */
function zonedNow(now: Date, timeZone: string): { date: string; day: Weekday; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { date: `${get('year')}-${get('month')}-${get('day')}`, day: JS_DAY[Math.max(0, wd)], time: `${get('hour')}:${get('minute')}` }
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Är platsen öppen nu, och i så fall till när - annars när den öppnar.
 * Avvikande dagar (stängt / andra tider) går före veckoschemat. Ett pass som
 * går över midnatt (t.ex. 18:00-02:00) räknas som öppet efter midnatt.
 */
export function openStatus(
  hours: BusinessHours,
  specialDays: { date: string; kind: 'closed' | 'hours' | 'no_online'; intervals?: DayHoursRange[] }[] = [],
  timeZone = 'Europe/Stockholm',
  now: Date = new Date(),
): OpenStatus {
  let zoned
  try {
    zoned = zonedNow(now, timeZone)
  } catch {
    zoned = zonedNow(now, 'Europe/Stockholm')
  }
  const special = new Map(specialDays.map((d) => [d.date, d]))
  const rangesFor = (date: string, day: Weekday): DayHoursRange[] => {
    const s = special.get(date)
    if (s?.kind === 'closed') return []
    if (s?.kind === 'hours') return s.intervals ?? []
    return hours[day] ?? []
  }
  const dayIndex = JS_DAY.indexOf(zoned.day)
  const today = rangesFor(zoned.date, zoned.day)
  const yesterday = rangesFor(addDays(zoned.date, -1), JS_DAY[(dayIndex + 6) % 7])

  // Gårdagens pass som går över midnatt.
  for (const r of yesterday) {
    if (r.closesAt < r.opensAt && zoned.time < r.closesAt) return { open: true, text: `Öppet till ${r.closesAt}` }
  }
  for (const r of today) {
    const overnight = r.closesAt < r.opensAt
    if (zoned.time >= r.opensAt && (overnight || zoned.time < r.closesAt)) {
      return { open: true, text: `Öppet till ${r.closesAt}` }
    }
  }
  const later = today.filter((r) => r.opensAt > zoned.time).sort((a, b) => a.opensAt.localeCompare(b.opensAt))
  if (later.length) return { open: false, text: `Öppnar ${later[0].opensAt}` }
  for (let n = 1; n <= 7; n++) {
    const day = JS_DAY[(dayIndex + n) % 7]
    const ranges = rangesFor(addDays(zoned.date, n), day)
    if (ranges.length) {
      const first = [...ranges].sort((a, b) => a.opensAt.localeCompare(b.opensAt))[0]
      const when = n === 1 ? 'i morgon' : WEEKDAY_SHORT[day].toLowerCase()
      return { open: false, text: `Öppnar ${when} ${first.opensAt}` }
    }
  }
  return { open: false, text: 'Stängt' }
}
