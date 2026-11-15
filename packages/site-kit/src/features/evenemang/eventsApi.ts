import { ApiError, apiBaseUrl, apiDelete, apiGet, apiPost } from '../../shared/api'
import { TICKET_PURCHASE_KEY } from '../../shared/storageRegistry'

/**
 * Evenemang och biljetter på restaurangens sajt (CONTRACTS.md 6.K K15-K22,
 * application docs/openapi/events-tickets.yaml). Alla rutter är publika;
 * biljettsidan och gåvan nås med en HMAC-länk som står i URL:ens fragment
 * (#...) och bara skickas i API-anropets sökväg.
 */

export interface PublicEventSummary {
  eventId: string
  title: string
  imageUrl?: string
  nextOccurrence: string
  fromPriceSek: number
  soldOut: boolean
}

export interface PublicOccurrence {
  occurrenceId: string
  startAt: string
  endAt?: string
  left: number
  soldOut: boolean
  salesOpen?: boolean
}

export interface PublicTicketType {
  typeId: string
  name: string
  priceSek: number
  priceOre?: number
  perOrderMax: number
  left?: number
  includes?: string
  available: boolean
}

/** En biljett som en annan gäst har lagt ut till samma pris som hen betalade (ADR-K 8). */
export interface ResaleListing {
  transferId: string
  occurrenceId: string
  typeId: string
  typeName: string
  priceSek: number
  priceOre: number
}

export interface PublicEvent {
  eventId: string
  title: string
  description?: string
  refundPolicy?: string | null
  perOrderMax: number
  occurrences: PublicOccurrence[]
  ticketTypes: PublicTicketType[]
  resaleAllowed?: boolean
  resale?: ResaleListing[]
}

/** Högst så många andrahandsbiljetter i en beställning (servern säger too_many_tickets över det). */
export const RESALE_PER_ORDER = 4

/** Hur många andrahandsbiljetter som får köpas åt gången: evenemangets max per köp, dock högst RESALE_PER_ORDER. */
export function resaleMax(event: Pick<PublicEvent, 'perOrderMax'>): number {
  return Math.max(1, Math.min(event.perOrderMax || RESALE_PER_ORDER, RESALE_PER_ORDER))
}

export interface TicketCheckout {
  clientSecret?: string
  amountSek: number
  expiresAt: string
  stripeAccount?: string
}

export type TicketStatus = 'valid' | 'checked_in' | 'transferred' | 'refunded' | 'void'

/** listed = ute till försäljning, sold = såld vidare (ogiltig), bought = köpt i andra hand. */
export type ResaleState = 'listed' | 'sold' | 'bought'

export interface PendingTransfer {
  transferId: string
  kind: 'gift' | 'resale'
  /** pending, eller claimed när en köpare håller på att betala för en utlagd biljett. */
  status: string
  priceOre: number
}

export interface TicketView {
  ticketId: string
  typeName: string
  holderName: string
  status: TicketStatus
  qr?: string
  checkedInAt?: string
  priceOre?: number
  pendingTransferId?: string
  pendingTransfer?: PendingTransfer
  resale?: ResaleState
}

export interface TicketPageData {
  event: { eventId: string; title: string; description?: string; refundPolicy?: string | null }
  occurrence: { occurrenceId: string; startAt: string; endAt?: string; doorsAt?: string | null; status?: string }
  location?: { locationId: string; name?: string | null }
  tickets: TicketView[]
  wallet: { apple: boolean; google: boolean }
  transferAllowed: boolean
  resaleAllowed: boolean
}

/** Antingen `lines` (nya platser) eller `resaleTransferIds` (utlagda biljetter), aldrig båda. */
export interface CheckoutBody {
  orderId: string
  occurrenceId: string
  lines?: { typeId: string; qty: number }[]
  resaleTransferIds?: string[]
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  turnstileToken?: string
}

const loc = (locationId: string) => `/public/locations/${encodeURIComponent(locationId)}/events`
const tok = (token: string) => `/public/tickets/${encodeURIComponent(token)}`

export const listEvents = (locationId: string) => apiGet<{ events: PublicEventSummary[] }>(loc(locationId))
export const getEvent = (locationId: string, eventId: string) =>
  apiGet<PublicEvent>(`${loc(locationId)}/${encodeURIComponent(eventId)}`)
export const checkout = (locationId: string, body: CheckoutBody) =>
  apiPost<TicketCheckout>(`${loc(locationId)}/checkout`, body)
export const getTickets = (token: string) => apiGet<TicketPageData>(tok(token))
export const giveTicket = (token: string, body: { transferId: string; ticketId: string; toEmail: string }) =>
  apiPost<{ transferId: string; ticketId: string; status: string }>(`${tok(token)}/transfers`, { ...body, kind: 'gift' })
/** Lägg ut biljetten till försäljning till samma pris som den köptes för (K20, kind resale). */
export const listForResale = (token: string, body: { transferId: string; ticketId: string }) =>
  apiPost<{ transferId: string; ticketId: string; status: string; priceOre: number }>(`${tok(token)}/transfers`, { ...body, kind: 'resale' })
/** Ångra en gåva som inte tagits emot, eller ta bort en biljett från försäljning (K22). */
export const cancelGift = (token: string, transferId: string) =>
  apiDelete<unknown>(`${tok(token)}/transfers/${encodeURIComponent(transferId)}`).catch((err: unknown) => {
    // 204 har ingen kropp: det är inte ett fel.
    if (err instanceof SyntaxError) return null
    throw err
  })
export const acceptGift = (transferToken: string, name: string) =>
  apiPost<{ ticketToken: string }>(`/public/ticket-transfers/${encodeURIComponent(transferToken)}/accept`, { name })

/** Länk till ett Wallet-pass (K19); visas bara när servern säger att Wallet finns. */
export function passUrl(token: string, ticketId: string, kind: 'apple' | 'google'): string {
  const q = new URLSearchParams({ ticketId, kind })
  return `${apiBaseUrl() ?? ''}${tok(token)}/pass?${q}`
}

/** Klient-id för order och gåva (idempotens): [0-9A-Za-z_]{8,40}. */
export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/** Länken i mejlet: /biljett#<token>. Fragmentet når aldrig servern som URL. */
export function tokenFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) return null
  try {
    const value = decodeURIComponent(raw)
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) && value.length <= 128 ? value : null
  } catch {
    return null
  }
}

export interface RememberedPurchase { orderId: string; eventId: string; title: string; amountSek: number; qty: number }

/** Köpet medan kortbetalningen bekräftas (3-D Secure kan lämna sidan). */
export function rememberPurchase(value: RememberedPurchase | null): void {
  try {
    if (value) window.sessionStorage.setItem(TICKET_PURCHASE_KEY, JSON.stringify(value))
    else window.sessionStorage.removeItem(TICKET_PURCHASE_KEY)
  } catch {
    // Privat läge: tack-sidan visar då bara den allmänna texten.
  }
}

export function rememberedPurchase(): RememberedPurchase | null {
  try {
    const raw = window.sessionStorage.getItem(TICKET_PURCHASE_KEY)
    return raw ? (JSON.parse(raw) as RememberedPurchase) : null
  } catch {
    return null
  }
}

const ERRORS: Record<string, string> = {
  sold_out: 'Det finns inte så många platser kvar. Välj färre biljetter eller ett annat datum.',
  type_sold_out: 'En av biljettyperna har tagit slut. Välj en annan.',
  sales_closed: 'Biljettförsäljningen till det här tillfället är stängd.',
  changed_retry: 'Biljetterna har ändrats sedan sidan laddades. Kontrollera valet och försök igen.',
  too_many_tickets: 'Det är för många biljetter i en beställning. Välj färre.',
  invalid_email: 'Kontrollera e-postadressen.',
  turnstile_failed: 'Säkerhetskontrollen gick inte igenom. Försök igen.',
  stripe_unavailable: 'Kortbetalningen svarar inte just nu. Försök igen om en stund.',
  no_stripe_account: 'Restaurangen kan inte ta emot kortbetalningar just nu.',
  too_many_requests: 'För många försök. Vänta en stund och försök igen.',
  transfer_closed: 'Biljetten kan inte ges bort eller säljas längre. Det går fram till två timmar före start.',
  invalid_state: 'Biljetten kan inte ändras just nu. Ladda om sidan.',
  resale_taken: 'Biljetten är inte längre till salu. Någon annan hann före, eller så togs den tillbaka.',
  invalid_price: 'En gratisbiljett kan inte säljas, men du kan ge bort den.',
  own_listing: 'Det är din egen biljett som är till salu. Ta bort den från försäljning på biljettsidan i stället.',
  resale_limit: 'Biljetten har redan sålts vidare en gång och kan inte säljas igen, men du kan ge bort den.',
}

/** API:ts felkod ({code} eller {error}), annars null. */
export function codeOf(err: unknown): string | null {
  return err instanceof ApiError ? String(err.body.code ?? err.body.error ?? '') || null : null
}

/** API:ts felkod som en svensk mening; annars `fallback`. */
export function eventsErrorMessage(err: unknown, fallback: string): string {
  const code = codeOf(err)
  return (code && ERRORS[code]) || fallback
}

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404

export function kr(sek: number): string {
  return `${sek.toLocaleString('sv-SE')} kr`
}

const TZ = 'Europe/Stockholm'

/** "fredag 14 november kl. 19:00" i platsens tidszon. */
export function when(iso: string, zone?: string | null): string {
  const timeZone = zone || TZ
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const fmt = (tz: string) => {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
    return `${day} kl. ${time(iso, tz)}`
  }
  try {
    return fmt(timeZone)
  } catch {
    return fmt(TZ)
  }
}

/** "19:00" i platsens tidszon. */
export function time(iso: string, zone?: string | null): string {
  const timeZone = zone || TZ
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  } catch {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  }
}

/** Ett giltigt K16-svar (servern kan i teorin skicka något annat). */
export function isPublicEvent(value: unknown): value is PublicEvent {
  const v = value as PublicEvent | null
  return Boolean(v && typeof v.eventId === 'string' && Array.isArray(v.occurrences) && Array.isArray(v.ticketTypes))
}

export function isTicketPage(value: unknown): value is TicketPageData {
  const v = value as TicketPageData | null
  return Boolean(v && v.event && v.occurrence && Array.isArray(v.tickets))
}

/**
 * Valet inom det som går att köpa nu (t.ex. efter att evenemanget laddats om
 * vid sold_out): typerna i tur och ordning, var och en högst maxFor.
 */
export function clampQty(qty: Record<string, number>, types: PublicTicketType[], occurrence: PublicOccurrence | undefined,
  eventMax: number): Record<string, number> {
  const out: Record<string, number> = {}
  let sum = 0
  for (const t of types) {
    const n = Math.min(qty[t.typeId] ?? 0, maxFor(t, occurrence, eventMax, sum))
    if (n > 0) out[t.typeId] = n
    sum += n
  }
  return out
}

/** Utlagda biljetter till ett tillfälle (tomt när vidareförsäljning är av eller stängd). */
export function listingsFor(event: PublicEvent, occurrenceId: string | undefined): ResaleListing[] {
  return (event.resale ?? []).filter((r) => r.occurrenceId === occurrenceId)
}

/** Hur många av en typ gästen högst kan välja just nu. */
export function maxFor(type: PublicTicketType, occurrence: PublicOccurrence | undefined, eventMax: number, chosenElsewhere: number): number {
  if (!type.available || !occurrence) return 0
  const roomInOrder = Math.max(0, eventMax - chosenElsewhere)
  const roomInHouse = Math.max(0, occurrence.left - chosenElsewhere)
  return Math.max(0, Math.min(type.perOrderMax, type.left ?? Number.POSITIVE_INFINITY, roomInOrder, roomInHouse))
}
