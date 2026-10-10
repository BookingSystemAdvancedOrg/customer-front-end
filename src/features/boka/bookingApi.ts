import { apiGet, apiPost, ApiError } from '../../shared/api'

/**
 * Klient mot bokningsrutterna (backend docs/RESERVATIONS.md):
 *
 *   GET  /locations/{l}/availability?date=          lediga tider + bord
 *   POST /locations/{l}/reservations                boka (gäst)
 *   GET  /locations/{l}/reservations/{r}/guest      min bokning (token)
 *   POST /locations/{l}/reservations/{r}/cancel     avboka (token)
 *
 * Gästens hanteringstoken skickas som X-Manage-Token-header.
 */

export interface AvailableTable {
  tableId: string
  seats: number
}

export interface AvailabilitySlot {
  startTime: string
  endTime: string
  layoutVersion: number | null
  tables: AvailableTable[]
}

export interface Availability {
  locationId: string
  date: string
  timezone: string
  slots: AvailabilitySlot[]
}

export interface BookingRequest {
  date: string
  startTime: string
  tableIds: string[]
  partySize: number
  name: string
  email: string
  phone: string
  notes?: string
  language?: 'sv' | 'en'
  marketingOptIn?: boolean
  acceptTerms: true
}

export interface GuestReservation {
  reservationId: string
  status: string
  date: string
  startTime: string
  endTime: string
  timezone?: string
  partySize: number
  tableIds: string[]
  customerName?: string
  cancellable: boolean
  location?: {
    locationId: string
    name: string
    address: string
    phoneNumber?: string | null
    email?: string | null
  }
  manageToken?: string
}

const path = (locationId: string) => `/locations/${encodeURIComponent(locationId)}`

/** Svenska felmeddelanden för API:ts felkoder. */
export function bookingErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return 'Det tog för lång tid att svara. Försök igen.'
  }
  if (!(err instanceof ApiError)) {
    return 'Något gick fel. Försök igen.'
  }
  switch (err.message) {
    case 'table_taken':
      return 'Bordet hann bokas av någon annan. Välj ett annat bord eller en annan tid.'
    case 'availability_changed':
    case 'changed_retry':
      return 'Något ändrades just nu. Försök igen.'
    case 'already_started':
      return 'Bokningen har redan börjat och kan inte avbokas här. Ring restaurangen.'
    case 'not_cancellable':
      return 'Bokningen kan inte avbokas.'
  }
  if (err.status === 404) return 'Bokningen hittades inte. Kontrollera länken.'
  if (err.status === 400) return `Kontrollera uppgifterna: ${err.message}`
  if (err.status === 429) return 'För många försök. Vänta en stund och försök igen.'
  return 'Bokningen kunde inte genomföras just nu. Försök igen om en stund.'
}

export function getAvailability(locationId: string, date: string): Promise<Availability> {
  return apiGet<Availability>(`${path(locationId)}/availability?date=${encodeURIComponent(date)}`)
}

export function createReservation(
  locationId: string,
  request: BookingRequest,
): Promise<GuestReservation> {
  return apiPost<GuestReservation>(`${path(locationId)}/reservations`, request)
}

export function getGuestReservation(
  locationId: string,
  reservationId: string,
  token: string,
): Promise<GuestReservation> {
  return apiGet<GuestReservation>(
    `${path(locationId)}/reservations/${encodeURIComponent(reservationId)}/guest`,
    { 'X-Manage-Token': token },
  )
}

export function cancelGuestReservation(
  locationId: string,
  reservationId: string,
  token: string,
): Promise<GuestReservation> {
  return apiPost<GuestReservation>(
    `${path(locationId)}/reservations/${encodeURIComponent(reservationId)}/cancel`,
    undefined,
    { 'X-Manage-Token': token },
  )
}

/** Länken gästen sparar: /bokning/<plats>/<id>#<token>. */
export function manageLink(origin: string, r: { reservationId: string }, locationId: string, token: string): string {
  return `${origin}/bokning/${encodeURIComponent(locationId)}/${encodeURIComponent(r.reservationId)}#${encodeURIComponent(token)}`
}

/** "2026-09-20" -> "söndag 20 september". */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** Dagens datum (YYYY-MM-DD) i restaurangens tidszon. */
export function todayIn(timezone: string | null | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone || 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now)
  } catch {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(now)
  }
}

/** De bokningsbara dagarna: idag + 20 dagar framåt (API:ts horisont). */
export function bookableDates(today: string, days = 21): string[] {
  const [y, m, d] = today.split('-').map(Number)
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d + i))
    return date.toISOString().slice(0, 10)
  })
}

/** Summan av platser vid de valda borden. */
export function seatsOf(tables: AvailableTable[], ids: string[]): number {
  return tables.filter((t) => ids.includes(t.tableId)).reduce((sum, t) => sum + t.seats, 0)
}
