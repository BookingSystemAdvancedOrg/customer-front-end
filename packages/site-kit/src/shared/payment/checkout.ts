import type { StripeCheckoutSession, StripePaymentElementOptions } from '@stripe/stripe-js'

/* Betalsteget (PaymentTicket, PaymentPanel): vad Stripes svar betyder och hur Payment Element ritas. */

/** Hur det gick när Stripe bekräftat: betald, eller tagen emot men behandlas fortfarande. */
export type PayOutcome = 'paid' | 'processing'

/**
 * Betald bara när Stripe säger det (complete + paid, eller inget att
 * betala). Klar men obetald (ett betalsätt som fortfarande behandlas) och
 * allt annat är "processing": statussidan får avgöra.
 */
export function payOutcome(session: Pick<StripeCheckoutSession, 'status'> | null | undefined): PayOutcome {
  const status = session?.status
  return status?.type === 'complete' && (status.paymentStatus === 'paid' || status.paymentStatus === 'no_payment_required')
    ? 'paid'
    : 'processing'
}

/** Under 768 px: betalsätten som en lista med radioknappar (fem flikar får inte plats på en telefon). */
const PHONE_QUERY = '(max-width: 767.98px)'

function phoneLayout(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches
}

/**
 * Payment Elements utseende, valt när formuläret ritas: en lista med
 * radioknappar på telefonen, flikar på bredare skärmar. Link av (sms-koden
 * går till Link-kontots nummer, inte gästens).
 */
export function paymentElementOptions(phone = phoneLayout()): StripePaymentElementOptions {
  return {
    layout: phone ? { type: 'accordion', radios: 'always', spacedAccordionItems: false } : { type: 'tabs' },
    wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' },
  }
}
