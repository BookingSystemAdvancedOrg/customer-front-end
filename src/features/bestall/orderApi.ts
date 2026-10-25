import { apiGet, apiPost, ApiError } from '../../shared/api'
import { withAttribution } from '../../shared/visits'
import { CART_KEY_PREFIX, ORDER_TOKEN_PREFIX, TABLE_KEY } from '../../shared/storageRegistry'

/**
 * Matbeställning (backend payment-intent / get-order, docs/ORDERS.md).
 *
 *   GET  /locations/{id}/ordering[?table=<kod>]  öppet nu? (och QR-kodens bord)
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

export type OrderMode = 'pickup' | 'table'

export interface OrderingState {
  open: boolean
  reason?: 'disabled' | 'no_payments' | 'paused' | 'closed'
  pickup?: boolean
  table?: boolean
  prepMinutes?: number
  closesAt?: string
  lastOrderAt?: string
  pausedUntil?: string
  forTable?: { label: string }
}

export interface OrderRequest {
  locationId: string
  mode: OrderMode
  tableCode?: string
  items: { menuItemId: string; quantity: number }[]
  name: string
  phone: string
  email: string
  notes?: string
  language: 'sv'
  acceptTerms: true
  turnstileToken?: string
  /** Välkomsterbjudandets kod (ABCD-EFGH). */
  discountCode?: string
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
  /** Checkout Sessionens hemlighet för Payment Element. */
  clientSecret: string
  /** Restaurangens Stripe-konto (acct_...). */
  stripeAccount: string
  statusToken: string
  totalAmount: number
}

export interface GuestOrder {
  orderId: string
  locationId: string
  number?: number
  status: 'pending_payment' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'failed'
  paymentStatus?: 'processing' | 'paid' | 'failed' | 'refunded'
  mode: OrderMode
  tableLabel?: string
  lines: { menuItemId: string; name: string; unitPrice: number; quantity: number; total: number; vatRate: number }[]
  totalAmount: number
  /** Rabattkod (raderna är redan rabatterade). */
  discount?: { code: string; percent: number; amount: number }
  vat?: { rate: number; gross: number; net: number; vat: number }[]
  customerName?: string
  confirmedAt?: string
  readyEstimate?: string
  readyAt?: string
  location?: { name?: string; address?: string; phoneNumber?: string | null }
}

const path = (locationId: string) => `/locations/${encodeURIComponent(locationId)}`

export function getOrdering(locationId: string, tableCode?: string | null): Promise<OrderingState> {
  const query = tableCode ? `?table=${encodeURIComponent(tableCode)}` : ''
  return apiGet<OrderingState>(`${path(locationId)}/ordering${query}`)
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

export type Cart = Record<string, number>

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

export function clearCart(locationId: string): void {
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

// --- QR-kod: bordet gästen sitter vid (behålls i fliken) ---------------------


export function tableCodeFrom(search: string): string | null {
  const fromUrl = new URLSearchParams(search).get('bord')
  try {
    if (fromUrl) sessionStorage.setItem(TABLE_KEY, fromUrl)
    return fromUrl ?? sessionStorage.getItem(TABLE_KEY)
  } catch {
    return fromUrl
  }
}

export function forgetTableCode(): void {
  try {
    sessionStorage.removeItem(TABLE_KEY)
  } catch {
    // Som ovan.
  }
}

// --- text ------------------------------------------------------------------------

/** 28550 (öre) -> "285,50 kr". */
/** Dagens datum i Sverige (YYYY-MM-DD), det datum servern sätter moms efter. */
export function stockholmDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(now)
}

/**
 * Momssatsen för en rad, samma regel som servern (shared/orders.py):
 * alkohol 25 %, vid bordet 12 %, avhämtning 6 % under den tillfälliga
 * matmomsen 2026-04-01 till 2027-12-31 och annars 12 %.
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
  ordering_table_off: 'Beställning vid bordet går inte just nu - fråga personalen.',
  menu_item_unavailable: 'En rätt i varukorgen finns inte längre på menyn. Ta bort den och försök igen.',
  alcohol_not_for_pickup: 'Drycker med alkohol kan bara beställas vid bordet.',
  'table code is invalid': 'QR-koden känns inte igen. Skanna koden på bordet igen.',
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
}

export function orderErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return 'Det tog för lång tid att svara. Försök igen.'
  }
  if (!(err instanceof ApiError)) return 'Något gick fel. Försök igen.'
  if (ORDER_ERRORS[err.message]) return ORDER_ERRORS[err.message]
  if (/^phone/.test(err.message)) return 'Fyll i ett giltigt mobilnummer, t.ex. 070-123 45 67.'
  if (/^email/.test(err.message)) return 'Fyll i en giltig e-postadress.'
  if (/^name/.test(err.message)) return 'Fyll i ditt namn.'
  if (/^quantity|^items may have/.test(err.message)) return `Högst ${MAX_QUANTITY} av varje rätt och ${MAX_LINES} olika rätter per beställning.`
  if (/^turnstile token expired/.test(err.message)) return 'Säkerhetskontrollen hann gå ut. Bekräfta igen.'
  if (/^turnstile/.test(err.message)) return 'Bekräfta säkerhetskontrollen och försök igen.'
  if (err.status === 404) return 'Beställningen hittades inte. Kontrollera länken.'
  if (err.status === 429) return ORDER_ERRORS.too_many_requests
  return 'Beställningen kunde inte skickas just nu. Försök igen om en stund.'
}
