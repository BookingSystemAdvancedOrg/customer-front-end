import { apiGet, apiPost, ApiError } from '../../shared/api'
import { withAttribution } from '../../shared/visits'
import { CATERING_TOKEN_PREFIX } from '../../shared/storageRegistry'

/**
 * Catering för gäster (backend: catering-settings, catering-discount-tiers,
 * catering-requests, catering-customer - infrastructure docs/CATERING-FLOW.md).
 *
 *   1. Kalkylen: gästen väljer rätter och portioner, datum, avhämtning eller
 *      leverans och skickar en förfrågan. Servern räknar om priset.
 *   2. Restaurangen skickar en offert (eller tackar nej). Gästen får länken
 *      /catering/<plats>/<id>#t=<token> i mejl och sms.
 *   3. Gästen signerar offerten med BankID, ber om ändringar eller avböjer.
 *   4. Privatperson betalar direkt (Stripe), företag får en faktura.
 *
 * Länkens token skickas som header (X-Order-Token), aldrig i URL:en.
 */

export interface CateringSettings {
  enabled: boolean
  minPortions: number
  maxPortions: number
  advanceDays: number
  pickup: boolean
  delivery: boolean
  deliveryArea: string
  maxDistanceKm: number
  priceWithinLimit: number
  priceBeyondLimit: number
  allowOutsideArea: boolean
  terms: string
  offerValidDays: number
  paymentTermsDays: number
}

export interface Tier {
  tierId: string
  name: string
  fromPortions: number
  toPortions: number | null
  discountPercent: number
  active: boolean
}

export interface Line {
  menuItemId?: string
  name: string
  unitPrice: number
  quantity: number
}

export interface Totals {
  subtotal: number
  discountPercent: number
  discount: number
  deliveryFee: number
  total: number
  vat: number
}

export type Status =
  | 'requested'
  | 'offer_sent'
  | 'change_requested'
  | 'signed'
  | 'confirmed'
  | 'delivered'
  | 'closed'
  | 'declined'
  | 'rejected'
  | 'expired'
  | 'cancelled'

export interface GuestRequest {
  requestId: string
  locationId: string
  status: Status
  customerType: 'private' | 'company'
  customerName: string
  companyName?: string
  deliveryDate: string
  deliveryTime: string
  fulfilment: 'pickup' | 'delivery'
  deliveryAddress?: { street: string; postalCode: string; city: string }
  request: { lines: Line[]; portions: number; tierName?: string | null } & Totals
  offer?: { version: number; lines: Line[]; totals: Totals; validUntil: string; message?: string;
    terms?: string; documentHash?: string }
  validUntil?: string
  signedAt?: string
  signedBy?: string
  paid?: boolean
  invoiceNumber?: string
  invoiceUrl?: string
  declineReason?: string
  cancelReason?: string
  changeMessage?: string
  paymentTermsDays?: number
  location?: { name?: string; address?: string; phoneNumber?: string; email?: string }
  canSign: boolean
  canPay: boolean
}

export interface RequestInput {
  items: { menuItemId: string; quantity: number }[]
  customerType: 'private' | 'company'
  name: string
  email: string
  phone: string
  companyName?: string
  orgNumber?: string
  invoiceReference?: string
  deliveryDate: string
  deliveryTime: string
  fulfilment: 'pickup' | 'delivery'
  deliveryZone?: 'within' | 'beyond'
  deliveryAddress?: { street: string; postalCode: string; city: string }
  guests?: number
  notes?: string
  acceptTerms: true
  language: 'sv'
  turnstileToken?: string
}

export interface SignState {
  status: 'pending' | 'failed' | 'complete' | 'none'
  hintCode?: string
  qrData?: string
  autoStartToken?: string
  request?: GuestRequest
}

const loc = (locationId: string) => `/locations/${encodeURIComponent(locationId)}/catering`
const cust = (locationId: string, requestId: string) =>
  `${loc(locationId)}/requests/${encodeURIComponent(requestId)}/customer`
const auth = (token: string) => ({ 'X-Order-Token': token })

export function getSettings(locationId: string): Promise<CateringSettings> {
  return apiGet(`${loc(locationId)}/settings`)
}

export async function getTiers(locationId: string): Promise<Tier[]> {
  return (await apiGet<{ tiers: Tier[] }>(`${loc(locationId)}/discount-tiers`)).tiers.filter((t) => t.active)
}

export function createRequest(
  locationId: string,
  input: RequestInput,
): Promise<{ requestId: string; locationId: string; token: string }> {
  return apiPost(`${loc(locationId)}/requests`, withAttribution(input))
}

export function getRequest(locationId: string, requestId: string, token: string): Promise<GuestRequest> {
  return apiGet(cust(locationId, requestId), auth(token))
}

export function startSigning(locationId: string, requestId: string, token: string): Promise<SignState> {
  return apiPost(`${cust(locationId, requestId)}/sign`, undefined, auth(token))
}

export function signingStatus(locationId: string, requestId: string, token: string): Promise<SignState> {
  return apiPost(`${cust(locationId, requestId)}/sign/status`, undefined, auth(token))
}

export function startCheckout(locationId: string, requestId: string, token: string): Promise<{ checkoutUrl: string }> {
  return apiPost(`${cust(locationId, requestId)}/checkout`, undefined, auth(token))
}

export function requestChange(locationId: string, requestId: string, token: string, message: string): Promise<GuestRequest> {
  return apiPost(`${cust(locationId, requestId)}/change`, { message }, auth(token))
}

export function rejectOffer(locationId: string, requestId: string, token: string, reason: string): Promise<GuestRequest> {
  return apiPost(`${cust(locationId, requestId)}/reject`, reason ? { reason } : {}, auth(token))
}

// --- token i fliken -------------------------------------------------------------------

const tokenKey = (requestId: string) => `${CATERING_TOKEN_PREFIX}${requestId}`

export function rememberToken(requestId: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(requestId), token)
  } catch {
    // Privat läge: länken i mejlet fungerar ändå.
  }
}

export function tokenFor(requestId: string, hash: string): string {
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('t')
  if (fromHash) {
    rememberToken(requestId, fromHash)
    return fromHash
  }
  try {
    return sessionStorage.getItem(tokenKey(requestId)) ?? ''
  } catch {
    return ''
  }
}

// --- räkning (samma regler som servern, shared/catering.py) -----------------------------

export function tierFor(tiers: Tier[], portions: number): Tier | null {
  let best: Tier | null = null
  for (const t of tiers) {
    if (!t.active || portions < t.fromPortions) continue
    if (t.toPortions !== null && portions > t.toPortions) continue
    if (!best || t.discountPercent > best.discountPercent) best = t
  }
  return best
}

export function nextTier(tiers: Tier[], portions: number): Tier | null {
  return [...tiers].filter((t) => t.active && t.fromPortions > portions)
    .sort((a, b) => a.fromPortions - b.fromPortions)[0] ?? null
}

export function estimate(
  lines: { price: number; quantity: number }[],
  tiers: Tier[],
  deliveryFeeKr: number,
): Totals & { portions: number; tier: Tier | null } {
  const portions = lines.reduce((n, l) => n + l.quantity, 0)
  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.price * 100) * l.quantity, 0)
  const tier = tierFor(tiers, portions)
  const discountPercent = tier?.discountPercent ?? 0
  const discount = Math.round((subtotal * discountPercent) / 100)
  const deliveryFee = Math.round(deliveryFeeKr * 100)
  const total = subtotal - discount + deliveryFee
  return { portions, tier, subtotal, discountPercent, discount, deliveryFee, total, vat: Math.round((total * 12) / 112) }
}

export function kronor(ore: number | undefined | null): string {
  const value = Number(ore ?? 0) / 100
  const digits = value % 1 ? 2 : 0
  return `${new Intl.NumberFormat('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} kr`
}

/** Tidigaste datum som går att beställa (YYYY-MM-DD, svensk tid). */
export function firstDate(advanceDays: number, now: Date = new Date()): string {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(now)
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + advanceDays)
  return d.toISOString().slice(0, 10)
}

// --- BankID-texter (BankID:s rekommenderade användarmeddelanden) ------------------------

export function bankIdMessage(hintCode: string | undefined, sameDevice: boolean): string {
  switch (hintCode) {
    case 'outstandingTransaction':
    case 'noClient':
      return sameDevice ? 'Starta BankID-appen.' : 'Starta BankID-appen och skanna QR-koden.'
    case 'started':
      return 'Söker efter BankID, det kan ta en liten stund…'
    case 'userMrtd':
      return 'Läs av ditt pass eller id-kort i BankID-appen.'
    case 'userCallConfirm':
      return 'Bekräfta samtalet i BankID-appen.'
    case 'userSign':
      return 'Skriv in din säkerhetskod i BankID-appen och välj Signera.'
    case 'userCancel':
      return 'Signeringen avbröts.'
    case 'expiredTransaction':
      return 'BankID-appen svarade inte. Kontrollera att den är startad och uppdaterad och försök igen.'
    case 'certificateErr':
      return 'Det BankID du försöker använda är för gammalt eller spärrat. Använd ett annat BankID eller beställ ett nytt hos din internetbank.'
    case 'startFailed':
      return 'BankID-appen verkar inte finnas i din dator eller telefon. Installera den och beställ ett BankID hos din internetbank.'
    default:
      return 'Signera med BankID.'
  }
}

const ERRORS: Record<string, string> = {
  catering_disabled: 'Restaurangen tar inte emot cateringförfrågningar just nu.',
  catering_too_soon: 'Datumet är för nära - välj ett senare datum.',
  catering_closed_day: 'Restaurangen har stängt den dagen. Välj ett annat datum.',
  catering_day_full: 'Restaurangen är fullbokad för catering den dagen. Välj ett annat datum eller färre portioner.',
  catering_outside_area: 'Restaurangen levererar inte utanför sitt område. Välj avhämtning.',
  catering_pickup_off: 'Avhämtning går inte att välja.',
  catering_delivery_off: 'Leverans går inte att välja.',
  menu_item_unavailable: 'En rätt finns inte längre på menyn. Ta bort den och försök igen.',
  not_signable: 'Offerten kan inte signeras just nu.',
  offer_expired: 'Offerten har gått ut. Kontakta restaurangen.',
  offer_changed: 'Restaurangen har skickat en ny version av offerten. Läs den och signera igen.',
  signing_unavailable: 'BankID går inte att nå just nu. Försök igen om en stund.',
  signing_alreadyInProgress: 'Du har redan en BankID-signering igång. Avbryt den i appen och försök igen.',
  not_payable: 'Beställningen kan inte betalas just nu.',
  payment_unavailable: 'Betalningen är inte tillgänglig just nu. Försök igen om en stund.',
  payment_provider_rejected: 'Betalningen kunde inte startas. Försök igen eller kontakta restaurangen.',
  not_changeable: 'Offerten kan inte ändras just nu.',
  not_rejectable: 'Förfrågan kan inte avböjas just nu.',
  verification_unavailable: 'Säkerhetskontrollen svarar inte just nu. Försök igen om en stund.',
  too_many_requests: 'För många försök. Vänta en stund och försök igen.',
  changed_retry: 'Något ändrades just nu. Försök igen.',
}

export function errorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'Det tog för lång tid. Försök igen.'
  if (!(err instanceof ApiError)) return 'Något gick fel. Försök igen.'
  if (ERRORS[err.message]) return ERRORS[err.message]
  if (/^at least (\d+) portions/.test(err.message)) return `Minst ${err.message.match(/\d+/)![0]} portioner.`
  if (/^at most (\d+) portions/.test(err.message)) return `Högst ${err.message.match(/\d+/)![0]} portioner.`
  if (/^orgNumber/.test(err.message)) return 'Fyll i ett giltigt organisationsnummer (NNNNNN-NNNN).'
  if (/^phone/.test(err.message)) return 'Fyll i ett giltigt mobilnummer.'
  if (/^email/.test(err.message)) return 'Fyll i en giltig e-postadress.'
  if (/^deliveryAddress/.test(err.message)) return 'Fyll i leveransadressen (gata, postnummer och ort).'
  if (/^turnstile/.test(err.message)) return 'Bekräfta säkerhetskontrollen och försök igen.'
  if (err.status === 404) return 'Förfrågan hittades inte. Kontrollera länken.'
  if (err.status === 429) return ERRORS.too_many_requests
  if (err.status === 400) return `Kontrollera uppgifterna: ${err.message}`
  return 'Det gick inte just nu. Försök igen om en stund.'
}
