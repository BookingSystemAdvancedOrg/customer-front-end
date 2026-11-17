import { apiGet, apiPost, ApiError } from '../../shared/api'
import { TABLE_BILL_PAY_PREFIX } from '../../shared/storageRegistry'

/**
 * Notan vid bordet (backend get-order / payment-intent, docs/ORDERS.md).
 * Beställningar med QR-koden på bordet går direkt till köket obetalda och
 * samlas på bordets nota; gästen betalar hela notan innan hen går.
 *
 *   GET  /locations/{id}/table-bill[?order=<orderId>]  notan (inga namn, telefoner eller mejl)
 *   POST /locations/{id}/table-bill/pay[?order=]       betala hela notan -> Checkout Session
 *   GET  /locations/{id}/table-bill/{billId}           en betalning av notan
 *
 * Nyckeln skickas alltid som header X-Order-Token, aldrig i URL:en: betal-
 * länken från personalens QR-kod, beställningens statustoken (med ?order=)
 * eller notans token för en betalning.
 */

export interface BillLine {
  name: string
  quantity: number
  total: number
  vatRate: number
}

export interface BillOrder {
  number?: number
  createdAt?: string
  total: number
  lines: BillLine[]
}

export interface BillVat {
  rate: number
  gross?: number
  net?: number
  vat: number
}

export interface TableBill {
  tableTitle?: string
  serviceDate?: string
  status: 'open' | 'paying' | 'empty'
  amount: number
  count: number
  currency?: string
  minChargeOre?: number
  orders: BillOrder[]
  vat: BillVat[]
  /** Bara medan någon betalar notan: när, och hur många sekunder tills den kan tas över. */
  paying?: { startedAt?: string; retryAfter?: number }
  location?: { name?: string }
}

export interface BillPayment {
  billId: string
  billToken: string
  clientSecret: string
  stripeAccount: string
  amount: number
  count: number
}

export interface PaidBill {
  billId: string
  status: 'paying' | 'paid' | 'expired' | 'failed'
  amount: number
  count?: number
  paidAt?: string
  tableTitle?: string
  orders: BillOrder[]
  vat: BillVat[]
}

const path = (locationId: string) => `/locations/${encodeURIComponent(locationId)}/table-bill`
const query = (orderId?: string | null) => (orderId ? `?order=${encodeURIComponent(orderId)}` : '')

export function getTableBill(locationId: string, token: string, orderId?: string | null): Promise<TableBill> {
  return apiGet<TableBill>(`${path(locationId)}${query(orderId)}`, { 'X-Order-Token': token })
}

export function payTableBill(
  locationId: string,
  token: string,
  orderId: string | null | undefined,
  body: { expectedAmount: number; email?: string; resumeBillId?: string; resumeToken?: string },
): Promise<BillPayment> {
  return apiPost<BillPayment>(`${path(locationId)}/pay${query(orderId)}`, body, { 'X-Order-Token': token })
}

export function getBillPayment(locationId: string, billId: string, billToken: string): Promise<PaidBill> {
  return apiGet<PaidBill>(`${path(locationId)}/${encodeURIComponent(billId)}`, { 'X-Order-Token': billToken })
}

// --- påbörjad betalning: samma Stripe-session om gästen går tillbaka ---------------

export interface PayResume {
  billId: string
  billToken: string
  amount: number
}

const resumeKey = (locationId: string) => `${TABLE_BILL_PAY_PREFIX}${locationId}`

export function rememberPayment(locationId: string, resume: PayResume): void {
  try {
    sessionStorage.setItem(resumeKey(locationId), JSON.stringify(resume))
  } catch {
    // Privat läge utan lagring: en ny betalning startas i stället.
  }
}

export function recallPayment(locationId: string): PayResume | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(resumeKey(locationId)) ?? 'null') as Partial<PayResume> | null
    if (!raw || typeof raw.billId !== 'string' || typeof raw.billToken !== 'string' || typeof raw.amount !== 'number') {
      return null
    }
    return { billId: raw.billId, billToken: raw.billToken, amount: raw.amount }
  } catch {
    return null
  }
}

export function forgetPayment(locationId: string): void {
  try {
    sessionStorage.removeItem(resumeKey(locationId))
  } catch {
    // Som ovan.
  }
}

// --- text ----------------------------------------------------------------------------

export const BILL_ERRORS: Record<string, string> = {
  bill_empty: 'Det finns inget att betala för bordet just nu.',
  bill_changed: 'Notan har ändrats, en ny beställning har kommit till. Kolla beloppet och tryck Betala igen.',
  bill_being_paid: 'Någon vid bordet betalar notan just nu. Vänta en minut och försök igen, eller fråga personalen.',
  bill_processing: 'Betalningen håller på att godkännas. Vänta en stund, sidan uppdateras av sig själv.',
  bill_paid: 'Notan är redan betald.',
  bill_below_minimum: 'Beloppet är för litet för att betala med kort. Betala hos personalen.',
  payment_unavailable: 'Betalningen fungerar inte just nu (Booqys fel). Betala hos personalen.',
  ordering_no_payments: 'Det går inte att betala notan i mobilen hos den här restaurangen. Betala hos personalen.',
  ordering_no_site: 'Det går inte att betala notan i mobilen just nu (Booqys fel). Betala hos personalen.',
  too_many_requests: 'För många försök. Vänta en stund och försök igen.',
  'email must be a valid email address': 'Fyll i en giltig e-postadress, eller lämna fältet tomt.',
}

export const LINK_GONE = 'Länken gäller inte längre. Be personalen om en ny QR-kod för notan.'

/** Felet på svenska, så att gästen vet vad hen ska göra. */
export function billErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'Det tog för lång tid att svara. Försök igen.'
  if (!(err instanceof ApiError)) return 'Något gick fel. Försök igen.'
  if (BILL_ERRORS[err.message]) return BILL_ERRORS[err.message]
  if (err.status === 404) return LINK_GONE
  if (err.status === 429) return BILL_ERRORS.too_many_requests
  if (err.status >= 500) return BILL_ERRORS.payment_unavailable
  return 'Något gick fel. Försök igen.'
}

/** Notan som följde med felet (bill_changed), annars null. */
export function billFromError(err: unknown): TableBill | null {
  if (!(err instanceof ApiError)) return null
  const bill = err.body?.bill
  return bill && typeof bill === 'object' && typeof (bill as TableBill).amount === 'number' ? (bill as TableBill) : null
}

/** Sajtens "Bord 7" / "bord 7" mitt i en mening. */
export function tableInSentence(title: string | undefined | null): string {
  if (!title) return 'ditt bord'
  return /^bord /i.test(title) ? `bord ${title.slice(5)}` : title
}
