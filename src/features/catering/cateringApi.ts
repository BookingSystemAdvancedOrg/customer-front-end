import { apiGet, apiPost, ApiError } from '../../shared/api'
import { withAttribution } from '../../shared/visits'
import { CATERING_TOKEN_PREFIX } from '../../shared/storageRegistry'

/**
 * Catering för gäster (backend: catering-settings, catering-discount-tiers,
 * catering-requests, catering-customer - infrastructure docs/CATERING-FLOW.md).
 *
 *   1. Kalkylen: gästen anger antal gäster, väljer paket och rätter, datum,
 *      avhämtning eller leverans. Priset kommer alltid från servern
 *      (POST .../catering/quote); sidan visar bara svaret, som ett uppskattat
 *      pris tills offerten är signerad.
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
  /** Kronor inkl. moms när utrustningen lämnas tillbaka ej rengjord (saknas hos äldre API). */
  cleaningFee?: number
  terms: string
  offerValidDays: number
  paymentTermsDays: number
  /** Saknas hos äldre API. */
  minGuests?: number
  allowSimpleAcceptance?: boolean
}

export interface CateringDish {
  dishId: string
  name: string
  description?: string
  pricePerPortion: number
  allergens?: string[]
  dietary?: string[]
}

export interface CateringPackage {
  packageId: string
  name: string
  description?: string
  pricePerGuest: number
  dishIds: string[]
  minGuests?: number
}

export interface CateringMenu {
  dishes: CateringDish[]
  packages: CateringPackage[]
}

export interface QuoteInput {
  guests: number
  packages?: { packageId: string; quantity: number }[]
  dishes?: { dishId: string; quantity: number }[]
  /** Rätter från den vanliga menyn, tills restaurangen har en egen cateringmeny. */
  items?: { menuItemId: string; quantity: number }[]
  fulfilment: 'pickup' | 'delivery'
  deliveryAddress?: { street: string; postalCode: string; city: string }
  equipmentReturn?: EquipmentReturn
  deliveryDate?: string
}

export interface Quote extends Totals {
  lines: Line[]
  guests: number
  portions: number
  tierName: string | null
  vatRate: number
  serviceIncluded: boolean
  distanceKm: number | null
  /** Adressen gick inte att hitta: restaurangen sätter leveranspriset i offerten. */
  deliveryFeeManual: boolean
  earliestDate: string
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
  dishId?: string
  packageId?: string
  kind?: 'package' | 'dish' | 'menu'
  vatRate?: number
  name: string
  unitPrice: number
  quantity: number
}

export interface Totals {
  subtotal: number
  discountPercent: number
  discount: number
  deliveryFee: number
  /** Saknas på offerter från innan valet fanns. */
  cleaningFee?: number
  total: number
  vat: number
  /** Saknas på offerter från innan momsen per rad. */
  vatRate?: number
}

/** Hur fat och utrustning kommer tillbaka till restaurangen. */
export type EquipmentReturn = 'cleaned' | 'not_cleaned'

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
    terms?: string; documentHash?: string; equipmentReturn?: EquipmentReturn }
  equipmentReturn?: EquipmentReturn
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
  /** Restaurangen har signerat; först då kan gästen signera. */
  restaurantSignedAt?: string
  canSign: boolean
  /** Godkänna utan BankID (om restaurangen tillåter det). */
  canAccept?: boolean
  canPay: boolean
  signedMethod?: 'bankid' | 'simulator' | 'simple_acceptance' | 'provider'
  /** Dokument som går att ladda ner: offerten och den signerade kopian. */
  documents?: ('offer' | 'signed')[]
}

export interface RequestInput extends QuoteInput {
  customerType: 'private' | 'company'
  name: string
  email: string
  phone: string
  companyName?: string
  orgNumber?: string
  invoiceReference?: string
  /** Företag: vem som signerar och att hen får göra det. */
  signatoryName?: string
  signatoryRole?: string
  signatoryAuthority?: true
  deliveryDate: string
  deliveryTime: string
  equipmentReturn: EquipmentReturn
  notes?: string
  acceptTerms: true
  language: 'sv'
  turnstileToken?: string
  /** Gästen kryssade i "skicka mig erbjudanden" (äldre backend). */
  marketingOptIn?: boolean
  /** Frivilligt samtycke till erbjudanden (shared/MarketingConsent.tsx). */
  marketingConsent?: { channels: ('email' | 'sms')[]; textVersion: string }
}

export interface SignState {
  status: 'pending' | 'failed' | 'complete' | 'none'
  /** Start: BankID här på sidan, eller signeringstjänstens egen sida. */
  kind?: 'bankid' | 'redirect'
  url?: string
  hintCode?: string
  qrData?: string
  autoStartToken?: string
  request?: GuestRequest
}

export interface AcceptInput {
  name: string
  role?: string
  confirmAuthority?: true
  acceptTerms: true
}

const loc = (locationId: string) => `/locations/${encodeURIComponent(locationId)}/catering`
const cust = (locationId: string, requestId: string) =>
  `${loc(locationId)}/requests/${encodeURIComponent(requestId)}/customer`
const auth = (token: string) => ({ 'X-Order-Token': token })

export function getSettings(locationId: string): Promise<CateringSettings> {
  return apiGet(`${loc(locationId)}/settings`)
}

/** Restaurangens egen cateringmeny (paket och rätter); tom innan den är upplagd. */
export function getCateringMenu(locationId: string): Promise<CateringMenu> {
  return apiGet(`${loc(locationId)}/menu`)
}

/** Priset för valet, räknat av servern (den enda källan till priser). */
export function getQuote(locationId: string, input: QuoteInput): Promise<Quote> {
  return apiPost(`${loc(locationId)}/quote`, input)
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

export function acceptOffer(locationId: string, requestId: string, token: string, input: AcceptInput): Promise<GuestRequest> {
  return apiPost(`${cust(locationId, requestId)}/accept`, input, auth(token))
}

/** En nedladdningslänk (5 minuter) till offerten eller den signerade kopian. */
export function documentLink(locationId: string, requestId: string, token: string, docId: 'offer' | 'signed'):
  Promise<{ url: string }> {
  return apiGet(`${cust(locationId, requestId)}/documents/${docId}`, auth(token))
}

/** Betalningen på sajtens egen sida: Checkout Sessionens hemlighet för Payment Element. */
export interface CateringPayment {
  clientSecret: string
  stripeAccount: string
}

export function startCheckout(locationId: string, requestId: string, token: string): Promise<CateringPayment> {
  return apiPost(`${cust(locationId, requestId)}/checkout`, { embedded: true }, auth(token))
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

// --- rabatt-tips (bara text; priset räknas alltid av servern) --------------------------

/** Nästa rabattnivå för fler gäster (nivåernas from/till är antal gäster). */
export function nextTier(tiers: Tier[], guests: number): Tier | null {
  return [...tiers].filter((t) => t.active && t.fromPortions > guests)
    .sort((a, b) => a.fromPortions - b.fromPortions)[0] ?? null
}

/** Allergener (EU 1169/2011) och kost, koder från servern. */
export const ALLERGEN_LABEL: Record<string, string> = {
  gluten: 'gluten', crustaceans: 'kräftdjur', eggs: 'ägg', fish: 'fisk', peanuts: 'jordnötter', soy: 'soja',
  milk: 'mjölk', nuts: 'nötter', celery: 'selleri', mustard: 'senap', sesame: 'sesam', sulphites: 'sulfiter',
  lupin: 'lupin', molluscs: 'blötdjur',
}
export const DIETARY_LABEL: Record<string, string> = {
  vegetarian: 'Vegetarisk', vegan: 'Vegansk', gluten_free: 'Glutenfri', lactose_free: 'Laktosfri',
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
  catering_outside_area: 'Adressen ligger utanför restaurangens leveransområde. Välj avhämtning.',
  catering_item_unavailable: 'Ett paket eller en rätt finns inte längre. Ta bort det och försök igen.',
  catering_pickup_off: 'Avhämtning går inte att välja.',
  catering_delivery_off: 'Leverans går inte att välja.',
  menu_item_unavailable: 'En rätt finns inte längre på menyn. Ta bort den och försök igen.',
  not_signable: 'Offerten kan inte signeras just nu.',
  awaiting_restaurant: 'Restaurangen signerar offerten först. Du får ett mejl när du kan signera.',
  acceptance_not_allowed: 'Restaurangen tar bara emot signering med BankID.',
  already_signed: 'Offerten är redan signerad.',
  offer_expired: 'Offerten har gått ut. Kontakta restaurangen.',
  offer_changed: 'Restaurangen har skickat en ny version av offerten. Läs den och signera igen.',
  signing_unavailable: 'BankID går inte att nå just nu. Försök igen om en stund.',
  signing_alreadyInProgress: 'Du har redan en BankID-signering igång. Avbryt den i appen och försök igen.',
  not_payable: 'Beställningen kan inte betalas just nu.',
  payment_unavailable: 'Betalningen är inte tillgänglig just nu. Försök igen om en stund.',
  payment_provider_rejected: 'Betalningen kunde inte startas. Försök igen eller kontakta restaurangen.',
  payment_in_progress: 'Betalningen behandlas redan. Ladda om sidan om en liten stund.',
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
  if (/^at least (\d+) guests/.test(err.message)) return `Minst ${err.message.match(/\d+/)![0]} gäster.`
  if (/needs at least (\d+) guests$/.test(err.message)) {
    return `${err.message.replace(/ needs at least.*/, '')} kräver minst ${err.message.match(/(\d+) guests$/)![1]} gäster.`
  }
  if (/^guests/.test(err.message)) return 'Fyll i antal gäster.'
  if (/^confirmAuthority/.test(err.message)) return 'Bekräfta att du får teckna avtal för företaget.'
  if (/^role/.test(err.message)) return 'Fyll i din roll i företaget.'
  if (/^signatory/.test(err.message)) return 'Fyll i vem som signerar för företaget och bekräfta behörigheten.'
  if (/^choose at least one/.test(err.message)) return 'Välj minst ett paket eller en rätt.'
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
