import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api'
import { isGiftCardError, knownOrderError, orderErrorMessage, stockholmDate, vatBreakdown, vatRate } from './orderApi'

describe('vatRate (same rule as the server)', () => {
  it('uses 25 % for alcohol and 12 % at the table', () => {
    expect(vatRate(true, 'pickup', '2026-10-25')).toBe(25)
    expect(vatRate(false, 'table', '2026-10-25')).toBe(12)
  })

  it('uses 6 % for pickup only during the temporary food VAT cut', () => {
    expect(vatRate(false, 'pickup', '2026-03-31')).toBe(12)
    expect(vatRate(false, 'pickup', '2026-04-01')).toBe(6)
    expect(vatRate(false, 'pickup', '2027-12-31')).toBe(6)
    expect(vatRate(false, 'pickup', '2028-01-01')).toBe(12)
  })
})

describe('vatBreakdown', () => {
  it('sums per rate and takes VAT out of prices that include it', () => {
    expect(vatBreakdown([
      { rate: 12, total: 11200 },
      { rate: 6, total: 12500 },
      { rate: 12, total: 2240 },
    ])).toEqual([{ rate: 6, vat: 708 }, { rate: 12, vat: 1440 }])
  })
})

describe('stockholmDate', () => {
  it('gives the Swedish date, also just after midnight there', () => {
    expect(stockholmDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })
})

describe('lineKey', () => {
  it('round-trips picks and keeps plain dishes as their id', async () => {
    const { lineKey, parseLineKey } = await import('./orderApi')
    expect(lineKey('pizza')).toBe('pizza')
    expect(parseLineKey('pizza')).toEqual({ menuItemId: 'pizza', picks: [] })
    const a = lineKey('pizza', [{ group: 'Storlek', choice: 'Stor' }, { group: 'Extra', choice: 'Ost' }])
    const b = lineKey('pizza', [{ group: 'Extra', choice: 'Ost' }, { group: 'Storlek', choice: 'Stor' }])
    expect(a).toBe(b)
    expect(parseLineKey(a)).toEqual({ menuItemId: 'pizza', picks: [{ group: 'Extra', choice: 'Ost' }, { group: 'Storlek', choice: 'Stor' }] })
    expect(parseLineKey('pizza#not json')).toEqual({ menuItemId: 'pizza', picks: [] })
  })
})

describe('gift card errors at checkout', () => {
  it.each([
    ['gift_card_not_found', 409, 'Presentkortskoden känns inte igen'],
    ['card_expired', 409, 'har gått ut'],
    ['card_void', 409, 'spärrat'],
    ['insufficient_balance', 409, 'upp till 30 minuter'],
    ['gift_card_min_order', 409, 'minst 3 kr'],
    ['gift_cards_off', 400, 'Presentkort kan inte användas här'],
    ['gift_card_unavailable', 503, 'Booqys fel'],
  ])('explains %s and flags the gift card field', (code, status, text) => {
    const err = new ApiError(status, code)
    expect(orderErrorMessage(err)).toContain(text)
    expect(isGiftCardError(err)).toBe(true)
  })

  it('does not flag other errors as gift card errors', () => {
    expect(isGiftCardError(new ApiError(409, 'ordering_paused'))).toBe(false)
    expect(isGiftCardError(new Error('gift_card_not_found'))).toBe(false)
  })
})

describe('knownOrderError', () => {
  it('keeps the own answer for a known code and leaves other load failures to the page', () => {
    expect(knownOrderError(new ApiError(400, 'table code revoked'))).toMatch(/QR-koden gäller inte längre/)
    expect(knownOrderError(new ApiError(500, 'boom'))).toBeNull()
    expect(knownOrderError(new TypeError('Failed to fetch'))).toBeNull()
  })
})
