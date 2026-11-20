import type { Stripe } from '@stripe/stripe-js'
import { currentLang, language } from '../lang/languages'

/**
 * Stripe.js för restaurangens eget Stripe-konto (direktdebitering via
 * Connect): en instans per (nyckel, konto), så js.stripe.com laddas en gång.
 * Allt Stripe visar (kortfält, fel, 3-D Secure) blir på sajtens språk
 * (svenska som standard; persiska visas på engelska, Stripe har ingen persiska).
 *
 * Paketet importeras först här, när ett betalsteg faktiskt behöver Stripe:
 * en statisk import laddar js.stripe.com (och Stripes cookies) redan när
 * sidan öppnas, vilket cookiesidan säger att vi inte gör.
 */
const cache = new Map<string, Promise<Stripe | null>>()

export function stripeFor(publishableKey: string, account: string): Promise<Stripe | null> {
  const locale = language(currentLang()).stripeLocale
  const key = `${publishableKey}|${account}|${locale}`
  let promise = cache.get(key)
  if (!promise) {
    promise = import('@stripe/stripe-js').then(({ loadStripe }) =>
      loadStripe(publishableKey, { stripeAccount: account, locale }),
    )
    // Ett misslyckat nätverksanrop ska kunna försökas igen.
    promise.catch(() => cache.delete(key))
    cache.set(key, promise)
  }
  return promise
}
