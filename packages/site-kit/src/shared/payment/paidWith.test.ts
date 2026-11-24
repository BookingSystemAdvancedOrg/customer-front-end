import { describe, expect, it } from 'vitest'
import { paidWithLabel, paidWithParts, paidWithText, refundWay } from './paidWith'
import type { PaidWith } from './paidWith'

describe('paidWithLabel', () => {
  it('names a card by brand and last four when both are known', () => {
    expect(paidWithLabel({ method: 'card', brand: 'visa', last4: '4242' })).toBe('Visa ****4242')
    expect(paidWithLabel({ method: 'card', brand: 'mastercard', last4: '4444' })).toBe('Mastercard ****4444')
    expect(paidWithLabel({ method: 'card', brand: 'amex', last4: '0005' })).toBe('American Express ****0005')
  })

  it('falls back to the brand, then to Kort', () => {
    expect(paidWithLabel({ method: 'card', brand: 'visa' })).toBe('Visa')
    expect(paidWithLabel({ method: 'card', last4: '4242' })).toBe('Kort')
    expect(paidWithLabel({ method: 'card', brand: 'okänt', last4: '4242' })).toBe('Kort')
    expect(paidWithLabel({ method: 'card', brand: 'visa', last4: '42' })).toBe('Visa')
    expect(paidWithLabel({ method: 'card' })).toBe('Kort')
  })

  it('names wallets and other methods without card digits', () => {
    expect(paidWithLabel({ method: 'apple_pay', brand: 'visa', last4: '4242' })).toBe('Apple Pay')
    expect(paidWithLabel({ method: 'google_pay' })).toBe('Google Pay')
    expect(paidWithLabel({ method: 'swish' })).toBe('Swish')
    expect(paidWithLabel({ method: 'klarna' })).toBe('Klarna')
    expect(paidWithLabel({ method: 'paypal' })).toBe('PayPal')
    expect(paidWithLabel({ method: 'link' })).toBe('Link')
    // No longer offered; an older payment still reads right.
    expect(paidWithLabel({ method: 'amazon_pay' })).toBe('Amazon Pay')
    expect(paidWithLabel({ method: 'revolut_pay' })).toBe('Revolut Pay')
    expect(paidWithLabel({ method: 'mobilepay' })).toBe('MobilePay')
    expect(refundWay({ method: 'amazon_pay' })).toBe(' inom några bankdagar')
    expect(paidWithLabel({ method: 'other' })).toBe('Stripe')
  })

  it('is null without a known method', () => {
    expect(paidWithLabel(undefined)).toBeNull()
    expect(paidWithLabel(null)).toBeNull()
    expect(paidWithLabel({ method: 'toString' } as unknown as PaidWith)).toBeNull()
    expect(paidWithLabel({} as PaidWith)).toBeNull()
  })
})

describe('paidWithText', () => {
  it('writes the receipt line', () => {
    expect(paidWithText({ method: 'swish' })).toBe('Betald med Swish')
    expect(paidWithText({ method: 'card', brand: 'visa', last4: '4242' })).toBe('Betald med Visa ****4242')
    expect(paidWithText({ method: 'card' })).toBe('Betald med kort')
    expect(paidWithText({ method: 'apple_pay' })).toBe('Betald med Apple Pay')
    expect(paidWithText({ method: 'other' })).toBe('Betald via Stripe')
    expect(paidWithText(undefined)).toBeNull()
  })

  it('marks proper names so the page translator leaves them alone', () => {
    expect(paidWithParts({ method: 'card', brand: 'visa', last4: '4242' })?.properName).toBe(true)
    expect(paidWithParts({ method: 'klarna' })?.properName).toBe(true)
    expect(paidWithParts({ method: 'card' })?.properName).toBe(false)
  })
})

describe('refundWay', () => {
  it('names how the money comes back', () => {
    expect(refundWay({ method: 'swish' })).toBe(' via Swish, oftast inom några minuter')
    expect(refundWay({ method: 'klarna' })).toBe(' via Klarna inom några bankdagar')
    expect(refundWay({ method: 'apple_pay' })).toBe(' till ditt kort inom några bankdagar')
    expect(refundWay(undefined)).toBe(' till ditt kort inom några bankdagar')
    expect(refundWay({ method: 'other' })).toBe(' inom några bankdagar')
  })
})
