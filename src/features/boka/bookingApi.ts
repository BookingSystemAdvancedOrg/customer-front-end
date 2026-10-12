import { apiGet, apiPost, ApiError } from '../../shared/api'

/**
 * Klient mot bokningsrutterna (backend docs/RESERVATIONS.md):
 *
 *   GET  /locations/{l}/availability?date=          lediga tider + bord
 *   POST /locations/{l}/reservations                boka (gäst)
 *   GET  /locations/{l}/reservations/{r}/guest      min bokning (token)
 *   POST /locations/{l}/reservations/{r}/confirm    kortgarantin klar (token)
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
  /** Kortgaranti: avgifter i öre och vad en avbokning NU skulle kosta. */
  guarantee?: {
    cardOnFile: boolean
    noShowFee: number
    lateCancelFee: number
    cancelCutoffHours: number
    currency: string
    cancellationFee: number
  }
  /** En debiterad/försökt avgift. */
  fee?: { kind: 'no_show' | 'late_cancel'; status: string; amount: number; refundedAmount: number }
  /** Bara direkt efter en bokning som kräver kort (status pending). */
  setup?: { clientSecret: string; stripeAccount: string; expiresAt: string }
}

/** 30000 (öre) -> "300 kr". */
export function formatFee(ore: number): string {
  const kr = ore / 100
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: kr % 1 ? 2 : 0 }).format(kr)} kr`
}

const path = (locationId: string) => `/locations/${encodeURIComponent(locationId)}`

// --- gästens uppgifter: samma regler som servern (shared/reservations.py) -----

export const NAME_MAX = 100
export const EMAIL_MAX = 254
export const NOTES_MAX = 500
const E164 = /^\+[1-9]\d{7,14}$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Telefonnummer som servern sparar dem (E.164), eller null om servern
 * skulle neka numret. "070-123 45 67" -> "+46701234567". */
export function normalizePhone(raw: string): string | null {
  let digits = raw.trim().replace(/[\s\-.]/g, '')
  digits = digits.replace(/^(\+\d{1,3})\(0\)/, '$1').replace(/[()]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  else if (digits.startsWith('0')) digits = `+46${digits.slice(1)}`
  return E164.test(digits) ? digits : null
}

export function validEmail(raw: string): boolean {
  const email = raw.trim()
  return email.length <= EMAIL_MAX && EMAIL.test(email)
}

/** Serverns valideringsfel (400) på svenska. */
const VALIDATION_TEXT: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^startTime is not a bookable time/, () => 'Tiden går inte att boka längre. Välj en annan tid.'],
  [/^tableIds contains a table that isn't bookable/, () => 'Ett av borden går inte att boka längre. Välj bord igen.'],
  [/^the selected tables seat/, () => 'Borden du valt har för få platser. Välj fler bord.'],
  [/^partySize must be at most (\d+) for online bookings/,
    (m) => `Online går det att boka för högst ${m[1]} personer. Ring restaurangen för större sällskap.`],
  [/^partySize must be/, () => 'Välj antal personer i listan.'],
  [/^date must not be in the past/, () => 'Den dagen har redan passerat. Välj en annan dag.'],
  [/^date must not be more than 21 days ahead/, () => 'Det går att boka högst 21 dagar fram.'],
  [/^phone must be a valid/, () => 'Fyll i ett giltigt telefonnummer, t.ex. 070-123 45 67.'],
  [/^email must be a valid/, () => 'Fyll i en giltig e-postadress.'],
  [/^(name|email|phone) is required/, () => 'Fyll i namn, e-post och telefon.'],
  [/^name must be at most/, () => `Namnet får vara högst ${NAME_MAX} tecken.`],
  [/^email must be at most/, () => `E-postadressen får vara högst ${EMAIL_MAX} tecken.`],
  [/^notes must be at most/, () => `Meddelandet får vara högst ${NOTES_MAX} tecken.`],
  [/^acceptTerms must be true/, () => 'Du behöver godkänna bokningsvillkoren.'],
  [/^(tableIds|at most \d+ tables)/, () => 'Välj bord igen.'],
]

/** Vad som inte gick längre när servern nekade en bokning: tiden (passerade
 * 30-minutersgränsen) eller ett bord (någon hann före) - då ska valet
 * rensas och lediga tider hämtas om. */
export function staleSelection(err: unknown): 'time' | 'tables' | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 400 && /^startTime is not a bookable time/.test(err.message)) return 'time'
  if (err.status === 409) return 'tables'
  if (err.status === 400 && /^tableIds contains a table that isn't bookable/.test(err.message)) return 'tables'
  return null
}

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
    case 'card_not_confirmed':
      return 'Kortet är inte bekräftat än. Slutför kortuppgifterna och försök igen.'
    case 'expired':
      return 'Tiden för att lägga in kortet gick ut och bordet släpptes. Gör en ny bokning.'
    case 'payment_unavailable':
      return 'Kortbetalningen är inte tillgänglig just nu. Försök igen om en stund.'
    case 'fee_applies':
      return 'Avbokningen kostar en avgift. Godkänn avgiften för att avboka.'
  }
  if (err.status === 404) return 'Bokningen hittades inte. Kontrollera länken.'
  if (err.status === 400) {
    for (const [pattern, text] of VALIDATION_TEXT) {
      const match = err.message.match(pattern)
      if (match) return text(match)
    }
    return `Kontrollera uppgifterna: ${err.message}`
  }
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
  acceptFee = false,
): Promise<GuestReservation> {
  return apiPost<GuestReservation>(
    `${path(locationId)}/reservations/${encodeURIComponent(reservationId)}/cancel`,
    acceptFee ? { acceptFee: true } : undefined,
    { 'X-Manage-Token': token },
  )
}

/** Gästen har bekräftat kortet hos Stripe - backend kontrollerar och bokar. */
export function confirmGuestReservation(
  locationId: string,
  reservationId: string,
  token: string,
): Promise<GuestReservation> {
  return apiPost<GuestReservation>(
    `${path(locationId)}/reservations/${encodeURIComponent(reservationId)}/confirm`,
    undefined,
    { 'X-Manage-Token': token },
  )
}

/** Kräver platsens villkor kort för det här sällskapet? */
export function needsCard(
  terms: { minPartySize: number } | null | undefined,
  partySize: number,
  stripeReady: boolean,
): boolean {
  return Boolean(terms && stripeReady && partySize >= terms.minPartySize)
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
