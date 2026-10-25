import { describe, expect, it } from 'vitest'
import { stockholmDate, vatBreakdown, vatRate } from './orderApi'

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
