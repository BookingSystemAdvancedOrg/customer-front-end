import { describe, expect, it } from 'vitest'
import { offeredMethods, redirectNote } from './checkout'

describe('offeredMethods', () => {
  it('keeps only card, Swish and Klarna from the server list', () => {
    expect(offeredMethods(['card', 'amazon_pay', 'klarna', 'link', 'swish', 'paypal'])).toEqual(['card', 'swish', 'klarna'])
    expect(offeredMethods(['card'])).toEqual(['card'])
    expect(offeredMethods([])).toEqual([])
  })

  it('is unknown without a list', () => {
    expect(offeredMethods(undefined)).toBeNull()
    expect(offeredMethods('card,swish')).toBeNull()
    expect(offeredMethods({ card: true })).toBeNull()
  })
})

describe('redirectNote', () => {
  it('names only the redirect methods the payment offers', () => {
    expect(redirectNote(['card', 'swish', 'klarna'])).toBe('Med Swish eller Klarna kan du skickas vidare en kort stund för att godkänna.')
    expect(redirectNote(['card', 'swish'])).toBe('Med Swish kan du skickas vidare en kort stund för att godkänna.')
    expect(redirectNote(['card', 'klarna'])).toBe('Med Klarna kan du skickas vidare en kort stund för att godkänna.')
  })

  it('names no method for card only or when unknown', () => {
    const neutral = 'Ibland skickas du vidare en kort stund för att godkänna betalningen.'
    expect(redirectNote(['card'])).toBe(neutral)
    expect(redirectNote([])).toBe(neutral)
    expect(redirectNote(null)).toBe(neutral)
    expect(redirectNote(undefined)).toBe(neutral)
  })
})
