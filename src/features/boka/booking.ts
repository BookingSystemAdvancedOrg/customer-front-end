import { apiGet, ApiError } from '../../shared/api'

/**
 * Bokningsflödets datamodell (Figma: boka-bord/betalning/bekräftelse).
 *
 * Layout och lediga bord kommer UTESLUTANDE från den publika
 * GET /locations/{id}/availability?date=…-rutten (openapi.yaml: `security:
 * []`, `x-required-groups: []`) — den returnerar per datum en lista slots
 * med `startTime`/`endTime` och de bord som är lediga just då
 * (`tableId`/`seats`, inga fler fält). Det finns medvetet ingen egen
 * tabell/mock här: en dag utan slots (stängt, fullbokat, eller ingen
 * publicerad layout) visas som "inga lediga tider", inte som påhittade.
 *
 * Det finns däremot INGEN publik rutt för själva planritningens geometri
 * (`/layout-elements/items` kräver staff_user/owner_user/super_user) eller
 * för platsens namn/adress/öppettider (`GET /locations/{id}` samma krav) —
 * de är medvetet kvar i src/shared/restaurant.ts tills backend exponerar
 * dem publikt.
 *
 * Bokningens sista steg (betalning/bekräftelse) är fortsatt en klientsidig
 * förhandsvisning: det finns ingen reservations-endpoint i kontraktet.
 */

export interface AvailableTable {
  tableId: string
  seats: number
}

export interface AvailabilitySlot {
  startTime: string
  endTime: string
  tables: AvailableTable[]
}

interface AvailabilityResponse {
  locationId: string
  date: string
  timezone: string
  slots?: AvailabilitySlot[]
}

export type AvailabilityResult =
  | { status: 'ok'; slots: AvailabilitySlot[] }
  | { status: 'error'; message: string }

function toFriendlyAvailabilityError(err: unknown): string {
  if (err instanceof ApiError) {
    console.error(`[Availability] ${err.status}: ${err.message}`)
    if (err.status === 404) return 'Restaurangen kunde inte hittas.'
    if (err.status === 503) {
      return 'Bokningssystemet är tillfälligt otillgängligt. Försök igen.'
    }
  }
  return 'Lediga tider kunde inte hämtas just nu. Försök igen om en stund.'
}

/** GET .../availability?date=… — publik, inget val faller tillbaka på mock. */
export async function fetchAvailability(
  locationId: string,
  isoDate: string,
): Promise<AvailabilityResult> {
  try {
    const res = await apiGet<AvailabilityResponse>(
      `/locations/${encodeURIComponent(locationId)}/availability?date=${encodeURIComponent(isoDate)}`,
    )
    return { status: 'ok', slots: res.slots ?? [] }
  } catch (err) {
    return { status: 'error', message: toFriendlyAvailabilityError(err) }
  }
}

/**
 * Bordens etikett finns inte i API:t (bara tableId + seats) — numrerade
 * efter listans ordning, samma mönster som admin-appens layoutApi.ts
 * använder för bordsetiketter som inte heller lagras av backend.
 */
export interface LabeledTable {
  tableId: string
  label: string
  seats: number
}

export function labelTables(tables: AvailableTable[]): LabeledTable[] {
  return [...tables]
    .sort((a, b) => a.tableId.localeCompare(b.tableId))
    .map((t, i) => ({ tableId: t.tableId, label: `Bord ${i + 1}`, seats: t.seats }))
}

/** Procentuell rutnätsposition i planritningspanelen för N bord. */
export interface FloorPosition {
  x: number
  y: number
}

export function gridPositions(count: number): FloorPosition[] {
  if (count <= 0) return []
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(count * 1.6))))
  const rows = Math.ceil(count / cols)
  const positions: FloorPosition[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.push({
      x: ((col + 1) / (cols + 1)) * 100,
      y: ((row + 1) / (rows + 1)) * 100,
    })
  }
  return positions
}

export interface BookingSelection {
  /** ISO-datum, t.ex. 2026-09-25. */
  date: string
  time: string
  endTime: string
  guests: number
  table: LabeledTable
}

export interface BookingContact {
  name: string
  email: string
  phone: string
}

/* --- Datum ------------------------------------------------------------------ */

export interface DayOption {
  /** ISO-datum. */
  date: string
  /** T.ex. "Mån". */
  weekday: string
  /** T.ex. "17". */
  dayOfMonth: string
}

const WEEKDAY_SHORT = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** De närmaste sju dagarna, med idag först. */
export function nextSevenDays(from: Date = new Date()): DayOption[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    return {
      date: toIsoDate(d),
      weekday: WEEKDAY_SHORT[d.getDay()],
      dayOfMonth: String(d.getDate()),
    }
  })
}

/** "Mån 17 augusti" — bokningssammanfattningens datumformat. */
export function formatBookingDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  const month = d.toLocaleDateString('sv-SE', { month: 'long' })
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${month}`
}

/* --- Pågående bokning över sidbyten ------------------------------------------ */

/**
 * Valen sparas i sessionStorage så att en omladdning på betalningssidan
 * inte tappar bokningen. Kontaktuppgifter ingår; kortuppgifter gör det
 * ALDRIG — de lever bara i betalningssidans komponenttillstånd.
 */
const BOOKING_KEY = 'kalla-booking'

export interface BookingDraft {
  selection: BookingSelection
  contact?: BookingContact
}

export function saveBookingDraft(draft: BookingDraft): void {
  try {
    sessionStorage.setItem(BOOKING_KEY, JSON.stringify(draft))
  } catch {
    // Avstängd sessionStorage: flödet funkar ändå inom samma sidvisning.
  }
}

export function readBookingDraft(): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(BOOKING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BookingDraft
    if (
      typeof parsed?.selection?.date !== 'string' ||
      typeof parsed.selection.time !== 'string' ||
      typeof parsed.selection.guests !== 'number' ||
      typeof parsed.selection.table?.tableId !== 'string'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearBookingDraft(): void {
  try {
    sessionStorage.removeItem(BOOKING_KEY)
  } catch {
    // Som ovan.
  }
}

/** Bokningsnummer i designens form, t.ex. #KL-4823. */
export function generateBookingNumber(): string {
  return `#KL-${String(Math.floor(1000 + Math.random() * 9000))}`
}
