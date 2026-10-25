import { loadStripe } from '@stripe/stripe-js'
import type { Stripe } from '@stripe/stripe-js'

/**
 * Stripe.js för restaurangens eget Stripe-konto (direktdebitering via
 * Connect): en instans per (nyckel, konto), så js.stripe.com laddas en gång.
 * Allt Stripe visar (kortfält, fel, 3-D Secure) blir på svenska.
 */
const cache = new Map<string, Promise<Stripe | null>>()

export function stripeFor(publishableKey: string, account: string): Promise<Stripe | null> {
  const key = `${publishableKey}|${account}`
  let promise = cache.get(key)
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount: account, locale: 'sv' })
    // Ett misslyckat nätverksanrop ska kunna försökas igen.
    promise.catch(() => cache.delete(key))
    cache.set(key, promise)
  }
  return promise
}
