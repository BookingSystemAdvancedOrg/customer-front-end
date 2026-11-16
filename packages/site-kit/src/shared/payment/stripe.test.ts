import { describe, expect, it, vi } from 'vitest'

const loadStripe = vi.fn(async () => ({}))
vi.mock('@stripe/stripe-js', () => ({ loadStripe }))

describe('stripeFor', () => {
  it('does not load Stripe.js until a payment step asks for it', async () => {
    const { stripeFor } = await import('./stripe')
    expect(loadStripe).not.toHaveBeenCalled()
    await stripeFor('pk_test_1', 'acct_1')
    expect(loadStripe).toHaveBeenCalledWith('pk_test_1', { stripeAccount: 'acct_1', locale: 'sv' })
  })

  it('reuses one instance per key and account, and retries after a failure', async () => {
    const { stripeFor } = await import('./stripe')
    loadStripe.mockClear()
    const a = stripeFor('pk_test_2', 'acct_2')
    expect(stripeFor('pk_test_2', 'acct_2')).toBe(a)
    await a
    expect(loadStripe).toHaveBeenCalledTimes(1)

    loadStripe.mockRejectedValueOnce(new Error('offline'))
    await expect(stripeFor('pk_test_3', 'acct_3')).rejects.toThrow('offline')
    await Promise.resolve()
    await stripeFor('pk_test_3', 'acct_3')
    expect(loadStripe).toHaveBeenCalledTimes(3)
  })
})
