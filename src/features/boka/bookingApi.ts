import { apiDelete, apiGet, apiPost, ApiError } from '../../shared/api'
import { withAttribution } from '../../shared/visits'

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

/** Ett sätt för sällskapet att boka tiden: ett bord eller en av
 * restaurangens bordskombinationer. */
export interface TableOption {
  tableIds: string[]
  seats: number
}

/** Varför ett bord inte går att välja för sällskapet vid tiden. */
export type TableReason = 'booked' | 'blocked' | 'phone' | 'too_small' | 'too_large' | 'unavailable'

export interface TableUnavailable {
  tableId: string
  reason: TableReason
  /** Sällskapsstorlekarna bordet tar online (bara vid too_small / too_large). */
  minParty?: number
  maxParty?: number
}

export interface AvailabilitySlot {
  startTime: string
  endTime: string
  layoutVersion: number | null
  /** Borden i alternativen nedan (gästvyn, med partySize). */
  tables: AvailableTable[]
  /** Det sällskapet får boka online, bästa passform först. */
  options?: TableOption[]
  /** Varför övriga bord inte går att välja (gästvyn). */
  unavailable?: TableUnavailable[]
  /** Hur länge bordet är ert, om det kan förlängas och specialtidens namn. */
  durationMinutes?: number
  extendable?: boolean
  ruleName?: string | null
}

/** Bokningens längd som den visas för gästen. */
export interface BookingLength {
  durationMinutes?: number
  extendable?: boolean
  ruleName?: string | null
}

function minutesText(minutes: number): string {
  if (minutes <= 60) return `${minutes} min`
  const rest = minutes % 60
  const hours = Math.floor(minutes / 60)
  return rest ? `${hours} tim ${rest} min` : `${hours} tim`
}

/** "1 tim 30 min, kan förlängas på plats om bordet är ledigt" /
 * "60 min (Lunchbuffé), kan inte förlängas" (null utan uppgift). */
export function lengthText({ durationMinutes, extendable, ruleName }: BookingLength): string | null {
  if (!durationMinutes) return null
  const rule = ruleName ? ` (${ruleName})` : ''
  const ext = extendable ? 'kan förlängas på plats om bordet är ledigt' : 'kan inte förlängas'
  return `${minutesText(durationMinutes)}${rule}, ${ext}`
}

function people(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'personer'}`
}

function sizeRange(u: TableUnavailable): string {
  const { minParty: min, maxParty: max } = u
  if (min && max) return min === max ? people(min) : `${min}-${max} personer`
  return ''
}

/** Kort text på bordet i planritningen. */
export function tableBadge(u: TableUnavailable): string {
  switch (u.reason) {
    case 'booked': return 'Bokat'
    case 'blocked': return 'Spärrat'
    case 'phone': return 'Ring oss'
    case 'too_small':
    case 'too_large': {
      const { minParty: min, maxParty: max } = u
      return min && max ? (min === max ? `${min} pers` : `${min}-${max} pers`) : 'Passar ej'
    }
    default: return 'Ej ledigt'
  }
}

/** Förklaringen när gästen trycker på ett bord som inte går att välja. */
export function tableReasonText(
  u: TableUnavailable,
  { label, partySize, startTime, phone, hasCombinations }: {
    label: string; partySize: number; startTime: string; phone?: string; hasCombinations: boolean
  },
): string {
  const table = `Bord ${label}`
  const party = `Ni är ${people(partySize)}`
  switch (u.reason) {
    case 'booked':
      return `${table} är redan bokat kl ${startTime}. Välj ett annat bord eller en annan tid.`
    case 'blocked':
      return `${table} är spärrat av restaurangen kl ${startTime} och kan inte bokas online.`
    case 'phone':
      return `${table} bokas bara via telefon${phone ? ` - ring ${phone}` : ''}.`
    case 'too_small':
      return `${table} tar ${sizeRange(u)} - ${party.toLowerCase()}. Välj ett större bord${
        hasCombinations ? ' eller bord som ställs ihop' : ''}.`
    case 'too_large':
      return `${table} är till för ${sizeRange(u)} - ${party.toLowerCase()}. Välj ett mindre bord, så räcker de stora borden till större sällskap.`
    default:
      return `${table} går inte att boka för ${people(partySize)} kl ${startTime}.`
  }
}

/** En avvikande dag: stängt, andra öppettider eller ingen onlinebokning. */
export interface DayStatus {
  kind: 'closed' | 'hours' | 'no_online'
  intervals?: { opensAt: string; closesAt: string }[]
  note?: string
}

export interface Availability {
  locationId: string
  date: string
  timezone: string
  slots: AvailabilitySlot[]
  /** Bara på en avvikande dag. */
  day?: DayStatus
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
  /** Frivilligt samtycke till erbjudanden (shared/MarketingConsent.tsx). */
  marketingConsent?: { channels: ('email' | 'sms')[]; textVersion: string }
  acceptTerms: true
  /** Token från säkerhetskontrollen (Cloudflare Turnstile) när den visas. */
  turnstileToken?: string
  /** Bordet hålls redan (POST /holds) - bokningen tar över det. */
  holdId?: string
}

/** Valda bord som hålls åt gästen medan uppgifterna fylls i (15 min). */
export interface TableHold {
  holdId: string
  /** Gästens token för hållet - och sedan för bokningen. */
  manageToken: string
  expiresAt: string
  holdMinutes: number
  date: string
  startTime: string
  endTime: string
  tableIds: string[]
  partySize: number
  cardRequired: boolean
  durationMinutes?: number
  extendable?: boolean
  ruleName?: string | null
}

export interface HoldRequest {
  date: string
  startTime: string
  tableIds: string[]
  partySize: number
  turnstileToken?: string
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
  durationMinutes?: number
  extendable?: boolean
  ruleName?: string | null
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
    /** Sista tiden (UTC) för kostnadsfri avbokning; null = ingen avgift för sen avbokning. */
    freeCancelUntil?: string | null
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
  [/^online booking is closed for this date/, () => 'Onlinebokningen är stängd den dagen. Ring oss för att boka.'],
  [/^tableIds are not offered online/, () => 'Bordet går inte att boka online för så många personer. Välj ett annat bord.'],
  [/^turnstile token expired/, () => 'Säkerhetskontrollen hann gå ut. Bekräfta igen och tryck Boka.'],
  [/^turnstile/, () => 'Bekräfta säkerhetskontrollen (rutan ovanför knappen) och försök igen.'],
  [/^(tableIds|at most \d+ tables)/, () => 'Välj bord igen.'],
]

/** Vad som inte gick längre när servern nekade en bokning: tiden (passerade
 * 30-minutersgränsen) eller ett bord (någon hann före) - då ska valet
 * rensas och lediga tider hämtas om. */
export function staleSelection(err: unknown): 'time' | 'tables' | null {
  if (!(err instanceof ApiError)) return null
  if (err.status === 400 && /^startTime is not a bookable time/.test(err.message)) return 'time'
  if (err.status === 409) return 'tables'
  if (
    err.status === 400 &&
    (/^tableIds contains a table that isn't bookable/.test(err.message) ||
      /^tableIds are not offered online/.test(err.message))
  ) {
    return 'tables'
  }
  return null
}

/** Servern kräver säkerhetskontrollen men sidan visar den inte - sidan
 * laddades innan kontrollen slogs på och behöver laddas om. */
export function turnstileMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 400 && /^turnstile token is required/.test(err.message)
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
    case 'hold_expired':
      return 'Tiden för att slutföra bokningen gick ut och bordet släpptes. Börja om.'
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
  if (err.status === 503 && err.message === 'verification_unavailable') {
    return 'Säkerhetskontrollen svarar inte just nu. Försök igen om en stund.'
  }
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

/** Lediga tider för ett sällskap: varje tid listar borden (eller
 * bordskombinationerna) sällskapet får boka online. */
export function getAvailability(locationId: string, date: string, partySize: number): Promise<Availability> {
  return apiGet<Availability>(
    `${path(locationId)}/availability?date=${encodeURIComponent(date)}&partySize=${partySize}`,
  )
}

/** Gästens text för en avvikande dag, eller null. */
export function dayMessage(day: DayStatus | null | undefined, phone: string): string | null {
  if (!day) return null
  const note = day.note ? ` (${day.note})` : ''
  const call = phone ? ` Ring oss på ${phone}.` : ''
  if (day.kind === 'closed') return `Vi har stängt den dagen${note}.`
  if (day.kind === 'no_online') return `Den dagen går det inte att boka online${note}.${call}`
  const hours = (day.intervals ?? []).map((i) => `${i.opensAt}-${i.closesAt}`).join(', ')
  return `Avvikande öppettider den dagen: ${hours}${note}.`
}

export function createReservation(
  locationId: string,
  request: BookingRequest,
  holdToken?: string,
): Promise<GuestReservation> {
  return apiPost<GuestReservation>(
    `${path(locationId)}/reservations`,
    withAttribution(request),
    holdToken ? { 'X-Manage-Token': holdToken } : undefined,
  )
}

/** Gästen bekräftade sina bord: de hålls i 15 minuter medan uppgifterna fylls i. */
export function holdTables(locationId: string, request: HoldRequest): Promise<TableHold> {
  return apiPost<TableHold>(`${path(locationId)}/holds`, request)
}

/** Släpp hållna bord (tiden gick ut, gästen bytte bord eller lämnade sidan). */
export function releaseHold(
  locationId: string,
  hold: Pick<TableHold, 'holdId' | 'manageToken'>,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<{ released: boolean }> {
  return apiDelete<{ released: boolean }>(
    `${path(locationId)}/holds/${encodeURIComponent(hold.holdId)}`,
    { 'X-Manage-Token': hold.manageToken },
    { keepalive },
  )
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

/** "2026-09-20" -> "sön 20 sep" - kort etikett för datumknapparna. */
export function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const parts = new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).formatToParts(new Date(Date.UTC(y, m - 1, d)))
  const get = (t: string) => (parts.find((p) => p.type === t)?.value ?? '').replace('.', '')
  return `${get('weekday')} ${get('day')} ${get('month')}`
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

/** mm:ss för nedräkningen när bordet hålls. */
export function clockText(seconds: number): string {
  const s = Math.max(0, seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const HOLD_EXPIRED_TEXT =
  'Tiden för att slutföra bokningen (15 minuter) gick ut och bordet släpptes. Börja om här.'
