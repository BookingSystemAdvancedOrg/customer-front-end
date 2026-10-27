import { describe, expect, it } from 'vitest'
import { bookingTerms, feeLines, type TermsContext, formatDeadline, formatKr, fromSnapshot, hours, persons } from './bookingTerms'
import type { GuaranteeTerms } from './site'

const both: GuaranteeTerms = { minPartySize: 1, noShowFeePerPerson: 250, lateCancelFeePerPerson: 150, cancelCutoffHours: 24 }
const noShowOnly: GuaranteeTerms = { ...both, lateCancelFeePerPerson: 0 }
const lateOnly: GuaranteeTerms = { ...both, noShowFeePerPerson: 0 }
const ctx = { legalName: 'Roma AB', graceMinutes: 15, phone: '08-123 456 78', email: 'hej@roma.se' }
// Intl skriver tusental med hårt mellanslag; jämför med vanligt.
const plain = (s: string) => s.replace(/ /g, ' ')
const flat = (t: GuaranteeTerms | null, c: TermsContext = ctx) => bookingTerms(t, c).map((s) => [s.heading, ...s.items].map(plain).join('\n')).join('\n\n')

describe('bookingTerms', () => {
  it('formats kronor the Swedish way', () => {
    expect(plain(formatKr(1000))).toBe('1 000 kr')
    expect(plain(formatKr(12500))).toBe('12 500 kr')
    expect(formatKr(250)).toBe('250 kr')
    expect(formatKr(62.5)).toBe('62,5 kr')
  })

  it('uses singular and plural forms', () => {
    expect([persons(1), persons(4), hours(1), hours(24)]).toEqual(['1 person', '4 personer', '1 timme', '24 timmar'])
    expect(feeLines({ ...both, cancelCutoffHours: 1 }, 1).map(plain)).toEqual([
      'Uteblivet besök: 250 kr/person.',
      'Avbokning senare än 1 timme före: 150 kr/person.',
      'Kostnadsfri avbokning fram till 1 timme före bokad tid.',
    ])
  })

  it('shows both fees for the party with totals and the exact deadline', () => {
    expect(feeLines(both, 4, 'torsdag 29 oktober kl 18:00').map(plain)).toEqual([
      'Uteblivet besök: 250 kr/person (1 000 kr för 4 personer).',
      'Avbokning senare än 24 timmar före: 150 kr/person (600 kr för 4 personer).',
      'Kostnadsfri avbokning senast torsdag 29 oktober kl 18:00.',
    ])
  })

  it('no-show only: cancelling is free until the start', () => {
    expect(feeLines(noShowOnly, 2).map(plain)).toEqual([
      'Uteblivet besök: 250 kr/person (500 kr för 2 personer).',
      'Kostnadsfri avbokning fram till bokad tid.',
    ])
    const text = flat(noShowOnly)
    expect(text).toContain('Du kan avboka kostnadsfritt fram till bokad tid.')
    expect(text).toContain('Avgiften för uteblivet besök dras bara om ingen i sällskapet kommer')
    expect(text).not.toContain('sen avbokning')
  })

  it('late-cancel only: no no-show fee anywhere', () => {
    const text = flat(lateOnly)
    expect(text).not.toContain('Uteblivet besök')
    expect(text).toContain('Avbokning senare än 24 timmar före: 150 kr/person.')
    expect(text).toContain('Du kan avboka kostnadsfritt fram till 24 timmar före bokad tid. Därefter kostar avbokningen 150 kr per person.')
  })

  it('a zero-hour cutoff never charges for cancelling', () => {
    expect(feeLines({ ...lateOnly, cancelCutoffHours: 0 })).toEqual(['Kostnadsfri avbokning fram till bokad tid.'])
  })

  it('both fees: the full version with every section', () => {
    expect(bookingTerms(both, ctx).map((s) => s.heading)).toEqual([
      'Din bokning', 'Om du blir sen', 'Kortgaranti', 'Avbokning', 'Återbetalning och frågor', 'Betalning', 'Personuppgifter',
    ])
    const text = flat(both)
    expect(text).toContain('Restaurangen tar kortgaranti för alla bokningar.')
    expect(text).toContain('Inget dras från kortet när du bokar.')
    expect(text).toContain('Restaurangen kan efterskänka avgiften vid sjukdom eller liknande.')
    expect(text).toContain('Vi håller bordet i 15 minuter efter bokad tid.')
    expect(text).toContain('Att komma sent kostar ingenting.')
    expect(text).toContain('direkt till restaurangens eget Stripe-konto (Roma AB)')
    expect(text).toContain('ring oss på 08-123 456 78')
  })

  it('a minimum party size says who needs a card and that smaller parties cancel free', () => {
    const text = flat({ ...both, minPartySize: 6 })
    expect(text).toContain('Restaurangen tar kortgaranti för sällskap om 6 personer eller fler. Mindre sällskap behöver inget kort.')
    expect(text).toContain('För sällskap under 6 personer är avbokningen kostnadsfri fram till bokad tid.')
  })

  it('no guarantee: the simple version without fees', () => {
    expect(bookingTerms(null, ctx).map((s) => s.heading)).toEqual([
      'Din bokning', 'Om du blir sen', 'Avbokning', 'Frågor', 'Personuppgifter',
    ])
    const text = flat(null, { legalName: 'Roma AB', graceMinutes: null, phone: '', email: '' })
    expect(text).not.toMatch(/ kr\b|kort|avgift/i)
    expect(text).toContain('Kommer du senare än bokad tid kan bordet ges till andra gäster.')
    expect(text).toContain('Frågor om din bokning: kontakta restaurangen.')
  })

  it('reads a booking snapshot (öre, whole party) back as kronor per person', () => {
    expect(fromSnapshot({ noShowFee: 100000, lateCancelFee: 60000, cancelCutoffHours: 24 }, 4)).toEqual(
      { minPartySize: 1, noShowFeePerPerson: 250, lateCancelFeePerPerson: 150, cancelCutoffHours: 24 },
    )
  })

  it('formats the deadline in the restaurant time zone, across summer time', () => {
    expect(formatDeadline('2026-10-29T17:00:00Z')).toBe('torsdag 29 oktober kl 18:00')
    expect(formatDeadline('2026-10-24T17:00:00Z', 'Europe/Stockholm')).toBe('lördag 24 oktober kl 19:00')
    expect(formatDeadline('2026-10-29T17:00:00Z', 'Not/AZone')).toBe('torsdag 29 oktober kl 18:00')
  })
})
