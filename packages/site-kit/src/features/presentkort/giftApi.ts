import { ApiError, apiGet, apiPost } from '../../shared/api'
import { GIFT_CARD_PURCHASE_KEY } from '../../shared/storageRegistry'

/** Presentkort på restaurangens sajt (CONTRACTS.md 6.E E1-E3). */

export interface Offer { amountsSek: number[]; customMinSek: number; customMaxSek: number; validityMonths: number }
export interface Checkout { clientSecret: string; amountSek: number; expiresAt: string; stripeAccount: string }

const base = (locationId: string) => `/public/locations/${encodeURIComponent(locationId)}/gift-cards`

export const getOffer = (locationId: string) => apiGet<Offer>(`${base(locationId)}/offer`)
export const startCheckout = (locationId: string, body: {
  purchaseId: string; amountSek: number; buyerEmail: string; recipientName?: string; recipientEmail?: string
  message?: string; turnstileToken?: string
}) => apiPost<Checkout>(`${base(locationId)}/checkout`, body)
export const checkBalance = (locationId: string, code: string, turnstileToken?: string) =>
  apiPost<{ balanceSek: number; balanceOre: number; expiresAt: string; status: string }>(`${base(locationId)}/balance`,
    { code, ...(turnstileToken ? { turnstileToken } : {}) })

export function newPurchaseId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/** Köpet medan kortbetalningen bekräftas (3-D Secure kan lämna sidan). */
export function rememberPurchase(value: { purchaseId: string; amountSek: number; expiresAt: string } | null): void {
  try {
    if (value) window.sessionStorage.setItem(GIFT_CARD_PURCHASE_KEY, JSON.stringify(value))
    else window.sessionStorage.removeItem(GIFT_CARD_PURCHASE_KEY)
  } catch {
    // Privat läge: tack-sidan visar då bara den allmänna texten.
  }
}

export function rememberedPurchase(): { purchaseId: string; amountSek: number; expiresAt: string } | null {
  try {
    const raw = window.sessionStorage.getItem(GIFT_CARD_PURCHASE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const ERRORS: Record<string, string> = {
  invalid_amount: 'Välj ett av beloppen eller ett eget belopp inom gränserna.',
  invalid_email: 'Kontrollera e-postadressen.',
  message_too_long: 'Hälsningen får vara högst 300 tecken.',
  turnstile_failed: 'Säkerhetskontrollen gick inte igenom. Försök igen.',
  stripe_unavailable: 'Kortbetalningen svarar inte just nu. Försök igen om en stund.',
  no_stripe_account: 'Restaurangen kan inte ta emot kortbetalningar just nu.',
  too_many_requests: 'För många försök. Vänta en stund och försök igen.',
}

export function giftErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const code = String(err.body.code ?? err.body.error ?? '')
    if (ERRORS[code]) return ERRORS[code]
  }
  return fallback
}

export function kr(sek: number): string {
  return `${sek.toLocaleString('sv-SE')} kr`
}
