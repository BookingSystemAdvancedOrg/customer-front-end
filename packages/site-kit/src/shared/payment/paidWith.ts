/**
 * Hur gästen betalade, som API:t skickar det (paidWith på beställningen och
 * cateringförfrågan), i kvittots ord: "Swish", "Apple Pay", "Visa ****4242"
 * eller "Kort". Samma ord som kvittomejlet (application
 * shared/payment_methods.py).
 */

export type PaidWithMethod = 'card' | 'apple_pay' | 'google_pay' | 'swish' | 'klarna' | 'paypal' | 'link' | 'other'

export interface PaidWith {
  method: PaidWithMethod
  /** Kortets märke som Stripe skriver det (visa, mastercard, amex ...). Bara kort och plånböcker. */
  brand?: string
  /** Kortets fyra sista siffror. Bara kort och plånböcker. */
  last4?: string
}

const LABELS: Record<PaidWithMethod, string> = {
  card: 'Kort',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  swish: 'Swish',
  klarna: 'Klarna',
  paypal: 'PayPal',
  link: 'Link',
  other: 'Stripe',
}

const BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  cartes_bancaires: 'Cartes Bancaires',
}

function known(paidWith: PaidWith | null | undefined): paidWith is PaidWith {
  return Boolean(paidWith && Object.hasOwn(LABELS, paidWith.method))
}

/** "Visa ****4242", "Visa", "Kort", "Swish" ...; null utan känt betalsätt. */
export function paidWithLabel(paidWith: PaidWith | null | undefined): string | null {
  if (!known(paidWith)) return null
  if (paidWith.method !== 'card') return LABELS[paidWith.method]
  const brand = Object.hasOwn(BRANDS, paidWith.brand ?? '') ? BRANDS[paidWith.brand!] : null
  const last4 = /^\d{4}$/.test(paidWith.last4 ?? '') ? paidWith.last4 : null
  if (brand && last4) return `${brand} ****${last4}`
  return brand ?? LABELS.card
}

/**
 * Raden på kvittot i delar: inledningen, namnet och om namnet är ett eget
 * namn (Visa, Swish, Klarna), som sidans översättare ska lämna i fred
 * ("Visa" är också ett svenskt verb).
 */
export function paidWithParts(
  paidWith: PaidWith | null | undefined,
): { lead: string; name: string; properName: boolean } | null {
  const label = paidWithLabel(paidWith)
  if (!label) return null
  if (paidWith!.method === 'other') return { lead: 'Betald via', name: label, properName: true }
  if (label === LABELS.card) return { lead: 'Betald med', name: 'kort', properName: false }
  return { lead: 'Betald med', name: label, properName: true }
}

/** "Betald med Swish", "Betald med Visa ****4242", "Betald med kort"; null utan känt betalsätt. */
export function paidWithText(paidWith: PaidWith | null | undefined): string | null {
  const parts = paidWithParts(paidWith)
  return parts ? `${parts.lead} ${parts.name}` : null
}

/**
 * Hur pengarna kommer tillbaka vid en återbetalning, som kvittomejlet
 * säger det: " till ditt kort inom några bankdagar", " via Swish, oftast
 * inom några minuter" ... (med inledande mellanslag).
 */
export function refundWay(paidWith: PaidWith | null | undefined): string {
  switch (paidWith?.method) {
    case 'swish':
      return ' via Swish, oftast inom några minuter'
    case 'klarna':
      return ' via Klarna inom några bankdagar'
    case 'paypal':
      return ' till ditt PayPal-konto inom några bankdagar'
    case undefined:
    case 'card':
    case 'apple_pay':
    case 'google_pay':
    case 'link':
      return ' till ditt kort inom några bankdagar'
    default:
      return ' inom några bankdagar'
  }
}
