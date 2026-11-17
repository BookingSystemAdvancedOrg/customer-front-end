import type { Stripe } from '@stripe/stripe-js'

/**
 * Stripe.js för restaurangens eget Stripe-konto (direktdebitering via
 * Connect): en instans per (nyckel, konto), så js.stripe.com laddas en gång.
 * Allt Stripe visar (kortfält, fel, 3-D Secure) blir på svenska.
 *
 * Paketet importeras först här, när ett betalsteg faktiskt behöver Stripe:
 * en statisk import laddar js.stripe.com (och Stripes cookies) redan när
 * sidan öppnas, vilket cookiesidan säger att vi inte gör.
 */
const cache = new Map<string, Promise<Stripe | null>>()

export function stripeFor(publishableKey: string, account: string): Promise<Stripe | null> {
  const key = `${publishableKey}|${account}`
  let promise = cache.get(key)
  if (!promise) {
    promise = import('@stripe/stripe-js').then(({ loadStripe }) =>
      loadStripe(publishableKey, { stripeAccount: account, locale: 'sv' }),
    )
    // Ett misslyckat nätverksanrop ska kunna försökas igen.
    promise.catch(() => cache.delete(key))
    cache.set(key, promise)
  }
  return promise
}
