import { apiGet, apiPost, ApiError } from '../../shared/api'
import { botCheckMessage } from '../../shared/botCheckMessage'
import { withAttribution } from '../../shared/visits'
import { CART_KEY_PREFIX, ORDER_TOKEN_PREFIX } from '../../shared/storageRegistry'
import type { PaidWith } from '../../shared/payment/paidWith'

/**
 * Matbeställning (backend payment-intent / get-order, docs/ORDERS.md).
 *
 *   GET  /locations/{id}/ordering                öppet nu för avhämtning?
 *   POST /order                                  beställningen -> betalningen (Checkout
 *                                                Session som sajten visar själv, embedded)
 *   GET  /locations/{id}/order-status/{orderId}  gästens beställning (X-Order-Token)
 *
 * Priserna räknas alltid om av servern från menyn - sajten skickar bara
 * vilka rätter och hur många. Statustoken (gästens "nyckel" till sin
 * beställning) skickas som header, aldrig i URL:en.
 */

export const MAX_QUANTITY = 20
export const MAX_LINES = 30
export const NOTES_MAX = 300
/** Högsta belopp för en beställning (öre) - samma skrivfelsspärr som servern
 * (shared/orders.py MAX_ORDER_ORE). */
export const MAX_ORDER_ORE = 5_000_000

/** Nya beställningar är alltid avhämtning; 'table' finns bara på äldre
 * beställningar från QR-koden på bordet (borttagen 2026-11-17). */
export type OrderMode = 'pickup' | 'table'

export interface OrderingState {
  open: boolean
  reason?: 'disabled' | 'no_payments' | 'paused' | 'closed'
  pickup?: boolean
  prepMinutes?: number
  closesAt?: string
  lastOrderAt?: string
  pausedUntil?: string
}

export interface OrderRequest {
  locationId: string
  mode: 'pickup'
  /** note ("ingen lök") och allergy ("jordnötsallergi") följer rätten till köksbongen. */
  items: { menuItemId: string; quantity: number; note?: string; allergy?: string; options?: OptionPick[] }[]
  name: string
  phone: string
  email: string
  notes?: string
  language: 'sv'
  acceptTerms: true
  /** Välkomsterbjudandets kod (ABCD-EFGH). */
  discountCode?: string
  /** Presentkortets kod (bara med presentkort i planen). */
  giftCardCode?: string
  /** Gästen kryssade i "skicka mig erbjudanden" (äldre backend). */
  marketingOptIn?: boolean
  /** Frivilligt samtycke till erbjudanden (shared/MarketingConsent.tsx). */
  marketingConsent?: { channels: ('email' | 'sms')[]; textVersion: string }
  /** Betalningen visas på sajtens egen sida (Payment Element), inte hos Stripe. */
  embedded: true
}

export interface OrderCreated {
  orderId: string
  locationId: string
  /** Checkout Sessionens hemlighet för Payment Element (saknas när presentkortet täcker allt). */
  clientSecret?: string
  /** Restaurangens Stripe-konto (acct_...), saknas som ovan. */
  stripeAccount?: string
  statusToken: string
  totalAmount: number
  /** Presentkortet som drogs: sista fyra tecknen och beloppet i öre. */
  giftCard?: { last4: string; debitedOre: number }
  /** Det som återstår att betala med kort (öre); 0 = presentkortet täckte allt och beställningen är betald. */
  chargedAmount?: number
}

export interface GuestOrder {
  orderId: string
  locationId: string
  number?: number
  status: 'pending_payment' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'failed'
  paymentStatus?: 'processing' | 'paid' | 'failed' | 'refunded'
  mode: OrderMode
  tableLabel?: string
  lines: {
    menuItemId: string
    name: string
    unitPrice: number
    quantity: number
    total: number
    vatRate: number
    options?: { group: string; choice: string; price: number }[]
  }[]
  totalAmount: number
  /** Rabattkod (raderna är redan rabatterade). */
  discount?: { code: string; percent: number; amount: number }
  vat?: { rate: number; gross: number; net: number; vat: number }[]
  customerName?: string
  confirmedAt?: string
  readyEstimate?: string
  readyAt?: string
  location?: { name?: string; address?: string; phoneNumber?: string | null }
  /** Hur gästen betalade (sätts när betalningen gått igenom). */
  paidWith?: PaidWith
}

const path = (locationId: string) => `/locations/${encodeURIComponent(locationId)}`

export function getOrdering(locationId: string): Promise<OrderingState> {
  return apiGet<OrderingState>(`${path(locationId)}/ordering`)
}

export function createOrder(request: OrderRequest): Promise<OrderCreated> {
  return apiPost<OrderCreated>('/order', withAttribution(request))
}

export function getOrder(locationId: string, orderId: string, token: string): Promise<GuestOrder> {
  return apiGet<GuestOrder>(`${path(locationId)}/order-status/${encodeURIComponent(orderId)}`, {
    'X-Order-Token': token,
  })
}

// --- status token: kvar i fliken mellan beställning och Stripes retur ---------

const tokenKey = (orderId: string) => `${ORDER_TOKEN_PREFIX}${orderId}`

export function rememberToken(orderId: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(orderId), token)
  } catch {
    // Privat läge utan lagring: länken i sms/mejl fungerar ändå.
  }
}

export function recallToken(orderId: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(orderId))
  } catch {
    return null
  }
}

// --- varukorgen (per plats, finns kvar om gästen avbryter betalningen) ---------

/** Nyckeln är rättens id, eller lineKey(id, val) för en rätt med tillval. */
export type Cart = Record<string, number>

/** Ett val gästen gjort i en tillvalsgrupp. */
export interface OptionPick {
  group: string
  choice: string
}

/**
 * Varukorgens nyckel för en rad: samma rätt med olika tillval blir olika
 * rader ("Pizza, stor" och "Pizza, normal"). Utan tillval är det bara id:t
 * (servern tillåter aldrig # i ett menuItemId).
 */
export function lineKey(menuItemId: string, picks: OptionPick[] = []): string {
  if (!picks.length) return menuItemId
  const sorted = picks.slice().sort((a, b) => a.group.localeCompare(b.group) || a.choice.localeCompare(b.choice))
  return `${menuItemId}#${JSON.stringify(sorted.map((p) => [p.group, p.choice]))}`
}

export function parseLineKey(key: string): { menuItemId: string; picks: OptionPick[] } {
  const at = key.indexOf('#')
  if (at < 0) return { menuItemId: key, picks: [] }
  try {
    const raw = JSON.parse(key.slice(at + 1)) as unknown
    const picks = Array.isArray(raw)
      ? raw.filter((p): p is [string, string] => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
        .map(([group, choice]) => ({ group, choice }))
      : []
    return { menuItemId: key.slice(0, at), picks }
  } catch {
    return { menuItemId: key.slice(0, at), picks: [] }
  }
}

const cartKey = (locationId: string) => `${CART_KEY_PREFIX}${locationId}`

export function loadCart(locationId: string): Cart {
  try {
    const raw = JSON.parse(sessionStorage.getItem(cartKey(locationId)) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object') return {}
    const cart: Cart = {}
    for (const [id, qty] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof qty === 'number' && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QUANTITY) cart[id] = qty
    }
    return cart
  } catch {
    return {}
  }
}

export function saveCart(locationId: string, cart: Cart): void {
  try {
    sessionStorage.setItem(cartKey(locationId), JSON.stringify(cart))
  } catch {
    // Som ovan.
  }
}

/** Önskemål och allergi per rätt i varukorgen (gäller alla av den rätten). */
export type LineNote = { note?: string; allergy?: string }
export type LineNotes = Record<string, LineNote>
export const LINE_TEXT_MAX = 140

const notesKey = (locationId: string) => `${cartKey(locationId)}:notes`

export function loadLineNotes(locationId: string): LineNotes {
  try {
    const raw = JSON.parse(sessionStorage.getItem(notesKey(locationId)) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object') return {}
    const out: LineNotes = {}
    for (const [id, v] of Object.entries(raw as Record<string, LineNote>)) {
      if (v && typeof v === 'object') out[id] = { note: String(v.note ?? ''), allergy: String(v.allergy ?? '') }
    }
    return out
  } catch {
    return {}
  }
}

export function saveLineNotes(locationId: string, notes: LineNotes): void {
  try {
    sessionStorage.setItem(notesKey(locationId), JSON.stringify(notes))
  } catch {
    // Som ovan.
  }
}

/** Det som skickas: trimmat, tomt utelämnat. */
export function lineExtras(n: LineNote | undefined): LineNote {
  const note = n?.note?.trim().slice(0, LINE_TEXT_MAX)
  const allergy = n?.allergy?.trim().slice(0, LINE_TEXT_MAX)
  return { ...(note ? { note } : {}), ...(allergy ? { allergy } : {}) }
}

export function clearCart(locationId: string): void {
  try {
    sessionStorage.removeItem(notesKey(locationId))
  } catch {
    // Som ovan.
  }
  try {
    sessionStorage.removeItem(cartKey(locationId))
  } catch {
    // Som ovan.
  }
}

/** Antal av en rätt efter +/-: alltid 0-20 (0 = bort ur varukorgen). */
export function stepQuantity(current: number, delta: number): number {
  return Math.min(MAX_QUANTITY, Math.max(0, current + delta))
}

// --- gamla QR-koder på borden -------------------------------------------------

/** En gammal QR-kod från ett bord (/bestall?bord=<kod>): leder till KassanPage. */
export function isTableQrLink(search: string): boolean {
  return new URLSearchParams(search).has('bord')
}

// --- text ------------------------------------------------------------------------

/** 28550 (öre) -> "285,50 kr". */
/** Dagens datum i Sverige (YYYY-MM-DD), det datum servern sätter moms efter. */
export function stockholmDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(now)
}

/**
 * Momssatsen för en rad, samma regel som servern (shared/orders.py):
 * alkohol 25 %, vid bordet 12 % (äldre beställningar), avhämtning 6 % under
 * den tillfälliga matmomsen 2026-04-01 till 2027-12-31 och annars 12 %.
 */
export function vatRate(alcohol: boolean, mode: OrderMode, today = stockholmDate()): number {
  if (alcohol) return 25
  if (mode === 'table') return 12
  return today >= '2026-04-01' && today <= '2027-12-31' ? 6 : 12
}

/** Momsen per sats i öre; priserna är inklusive moms (moms = brutto * sats / (100 + sats)). */
export function vatBreakdown(lines: { rate: number; total: number }[]): { rate: number; vat: number }[] {
  const byRate = new Map<number, number>()
  for (const l of lines) byRate.set(l.rate, (byRate.get(l.rate) ?? 0) + l.total)
  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, gross]) => ({ rate, vat: Math.round((gross * rate) / (100 + rate)) }))
}

export function kronor(ore: number): string {
  const [whole, decimals] = (ore / 100).toFixed(2).split('.')
  // Svensk tusengruppering med hårt mellanslag: 3 500 000 kr.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return `${decimals === '00' ? grouped : `${grouped},${decimals}`} kr`
}

export function clock(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }).format(d)
}

export function closedMessage(state: OrderingState, phone: string): string {
  switch (state.reason) {
    case 'paused':
      return `Köket har fullt upp just nu - beställ igen efter ${clock(state.pausedUntil)}.`
    case 'closed':
      return 'Vi tar inte emot beställningar just nu (utanför öppettiderna).'
    default:
      return `Det går inte att beställa online just nu.${phone ? ` Ring oss på ${phone}.` : ''}`
  }
}

/** När menyn hämtats om och rätten faktiskt plockats ur varukorgen. */
export const MENU_ITEM_REMOVED =
  'En rätt i varukorgen finns inte längre på menyn och har tagits bort. Kontrollera beställningen och försök igen.'

const ORDER_ERRORS: Record<string, string> = {
  ordering_closed: 'Vi har precis slutat ta emot beställningar för idag.',
  ordering_paused: 'Köket har pausat beställningar en stund. Försök igen om en liten stund.',
  ordering_disabled: 'Det går inte att beställa online just nu.',
  ordering_no_payments: 'Betalningen är inte tillgänglig just nu.',
  ordering_no_site: 'Det går inte att beställa online just nu.',
  ordering_pickup_off: 'Avhämtning går inte att beställa just nu.',
  ordering_table_off: 'Beställ och betala i kassan i restaurangen.',
  table_ordering_off: 'Beställ och betala i kassan i restaurangen.',
  menu_item_unavailable: 'En rätt i varukorgen finns inte längre på menyn. Ta bort den och försök igen.',
  alcohol_not_for_pickup: 'Drycker med alkohol går inte att beställa för avhämtning. Ta bort dem och försök igen.',
  option_invalid: 'Ett tillval i varukorgen finns inte längre. Ta bort rätten och lägg till den igen.',
  option_required: 'Välj de tillval som krävs, till exempel storlek, och försök igen.',
  payment_unavailable: 'Betalningen är inte tillgänglig just nu. Försök igen om en stund.',
  verification_unavailable: 'Säkerhetskontrollen svarar inte just nu. Försök igen om en stund.',
  too_many_requests: 'För många försök. Vänta en stund och försök igen.',
  'order total is too large': 'Beställningen är för stor för att betalas online (högst 50 000 kr). Kontakta restaurangen.',
  'order total must be more than 0 kr': 'Varukorgen är tom. Lägg till en rätt först.',
  'items must be a non-empty list': 'Varukorgen är tom. Lägg till en rätt först.',
  'acceptTerms must be true': 'Godkänn villkoren för att betala.',
  discount_invalid: 'Rabattkoden känns inte igen. Kontrollera den i mejlet.',
  discount_expired: 'Rabattkoden har gått ut.',
  discount_used: 'Rabattkoden är redan använd.',
  discount_min_order: 'Beställningen är under minsta beloppet för rabattkoden.',
  discount_other_email: 'Rabattkoden gäller bara med e-postadressen den skickades till.',
  gift_card_not_found: 'Presentkortskoden känns inte igen. Kontrollera koden.',
  card_expired: 'Presentkortet har gått ut. Ta bort koden och betala med kort.',
  card_void: 'Presentkortet är spärrat. Ta bort koden och betala med kort, eller kontakta restaurangen.',
  insufficient_balance:
    'Presentkortet har inget saldo kvar (det kan vara reserverat för en obetald beställning i upp till 30 minuter). Ta bort koden och betala med kort.',
  gift_card_min_order:
    'Presentkortet kan inte användas för det här beloppet: det som blir kvar att betala måste vara minst 3 kr. Lägg till något mer eller ta bort koden.',
  gift_card_refused: 'Presentkortet kan inte användas. Kontrollera koden eller ta bort den och betala med kort.',
  gift_cards_off: 'Presentkort kan inte användas här just nu. Ta bort koden och betala med kort.',
  'giftCardCode must be text': 'Presentkortskoden känns inte igen. Kontrollera koden.',
  gift_card_unavailable:
    'Presentkort går inte att använda just nu (Booqys fel). Försök igen om en stund, eller ta bort koden och betala med kort.',
}

const GIFT_CARD_ERRORS = new Set([
  'gift_card_not_found', 'card_expired', 'card_void', 'insufficient_balance', 'gift_card_min_order',
  'gift_card_refused', 'gift_cards_off', 'giftCardCode must be text', 'gift_card_unavailable',
])

/** Felet gäller presentkortskoden (fältet ska markeras). */
export function isGiftCardError(err: unknown): boolean {
  return err instanceof ApiError && GIFT_CARD_ERRORS.has(err.message)
}

/** Ett fel från servern med eget svar (t.ex. pausat); null = hämtningen misslyckades. */
export function knownOrderError(err: unknown): string | null {
  return err instanceof ApiError && ORDER_ERRORS[err.message] ? ORDER_ERRORS[err.message] : null
}

export function orderErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return 'Det tog för lång tid att svara. Försök igen.'
  }
  if (!(err instanceof ApiError)) return 'Något gick fel. Försök igen.'
  const botCheck = botCheckMessage(err)
  if (botCheck) return botCheck
  if (ORDER_ERRORS[err.message]) return ORDER_ERRORS[err.message]
  if (/^phone/.test(err.message)) return 'Fyll i ett giltigt mobilnummer, t.ex. 070-123 45 67.'
  if (/^email/.test(err.message)) return 'Fyll i en giltig e-postadress.'
  if (/^name/.test(err.message)) return 'Fyll i ditt namn.'
  if (/^quantity|^items may have/.test(err.message)) return `Högst ${MAX_QUANTITY} av varje rätt och ${MAX_LINES} olika rätter per beställning.`
  if (err.status === 404) return 'Beställningen hittades inte. Kontrollera länken.'
  if (err.status === 429) return ORDER_ERRORS.too_many_requests
  return 'Beställningen kunde inte skickas just nu. Försök igen om en stund.'
}
