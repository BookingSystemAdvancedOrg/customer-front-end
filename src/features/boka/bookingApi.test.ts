import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/api'
import {
  bookableDates,
  bookingErrorMessage,
  cancelGuestReservation,
  createReservation,
  formatDate,
  getGuestReservation,
  manageLink,
  normalizePhone,
  staleSelection,
  todayIn,
  validEmail,
} from './bookingApi'
import { json } from '../../test/siteData'

afterEach(() => vi.unstubAllGlobals())

describe('dates', () => {
  it('gives 21 bookable days across month ends', () => {
    const days = bookableDates('2026-09-25')
    expect(days).toHaveLength(21)
    expect(days[0]).toBe('2026-09-25')
    expect(days[6]).toBe('2026-10-01')
    expect(days[20]).toBe('2026-10-15')
  })

  it("uses the restaurant's time zone for today", () => {
    const lateNightUtc = new Date('2026-09-20T22:30:00Z') // 00:30 in Stockholm
    expect(todayIn('Europe/Stockholm', lateNightUtc)).toBe('2026-09-21')
    expect(todayIn('Not/AZone', lateNightUtc)).toBe('2026-09-21')
  })

  it('formats Swedish dates', () => {
    expect(formatDate('2026-09-20')).toBe('söndag 20 september')
  })
})

describe('errors', () => {
  it.each([
    [new ApiError(409, 'table_taken'), 'hann bokas'],
    [new ApiError(409, 'already_started'), 'redan börjat'],
    [new ApiError(404, 'not found'), 'hittades inte'],
    [new ApiError(400, 'phone must be valid'), 'phone must be valid'],
    [new ApiError(503, 'x'), 'kunde inte genomföras'],
    [new ApiError(400, 'startTime is not a bookable time for this date'), 'Tiden går inte att boka längre'],
    [new ApiError(400, "tableIds contains a table that isn't bookable at this time"), 'Välj bord igen'],
    [new ApiError(400, 'phone must be a valid phone number, e.g. +46701234567'), 'giltigt telefonnummer'],
    [new ApiError(400, 'partySize must be at most 8 for online bookings'), 'högst 8 personer'],
    [new ApiError(400, 'date must not be in the past'), 'redan passerat'],
  ])('%s', (err, text) => {
    expect(bookingErrorMessage(err)).toContain(text)
  })

  it('never shows the server English for known refusals', () => {
    for (const message of [
      'startTime is not a bookable time for this date',
      'the selected tables seat 2; choose more tables for 3 guests',
      'email must be a valid email address',
      'phone is required',
      'notes must be at most 500 characters',
    ]) {
      expect(bookingErrorMessage(new ApiError(400, message))).not.toMatch(/Kontrollera uppgifterna/)
    }
  })

  it('tells which choice went stale', () => {
    expect(staleSelection(new ApiError(400, 'startTime is not a bookable time for this date'))).toBe('time')
    expect(staleSelection(new ApiError(409, 'table_taken'))).toBe('tables')
    expect(staleSelection(new ApiError(400, "tableIds contains a table that isn't bookable at this time"))).toBe('tables')
    expect(staleSelection(new ApiError(400, 'phone is required'))).toBeNull()
    expect(staleSelection(new Error('x'))).toBeNull()
  })
})

describe('guest fields (same rules as the server)', () => {
  it.each([
    ['070-123 45 67', '+46701234567'],
    ['0701234567', '+46701234567'],
    ['+46 (0)70 123 45 67', '+46701234567'],
    ['0046701234567', '+46701234567'],
    ['+358 40 123 4567', '+358401234567'],
  ])('accepts %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected)
  })

  it.each(['', '12345678', '070-12', '+0701234567', 'telefon'])('rejects %s', (raw) => {
    expect(normalizePhone(raw)).toBeNull()
  })

  it('checks e-mail addresses', () => {
    expect(validEmail(' anna@example.se ')).toBe(true)
    expect(validEmail('anna@example')).toBe(false)
    expect(validEmail(`${'a'.repeat(250)}@x.se`)).toBe(false)
  })
})

describe('requests', () => {
  it('books with a JSON POST and no credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ reservationId: 'r1' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await createReservation('loc 1', {
      date: '2026-09-20', startTime: '18:00', tableIds: ['t1'], partySize: 2,
      name: 'A', email: 'a@b.se', phone: '0701234567', acceptTerms: true,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/locations/loc%201/reservations')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body).tableIds).toEqual(['t1'])
  })

  it('sends the manage token as a header, never in the URL', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ reservationId: 'r1' }))
    vi.stubGlobal('fetch', fetchMock)

    await getGuestReservation('loc', 'r1', 'secret-token')
    await cancelGuestReservation('loc', 'r1', 'secret-token')

    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).not.toContain('secret-token')
      expect(init.headers['X-Manage-Token']).toBe('secret-token')
    }
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/locations/loc/reservations/r1/cancel')
  })

  it('puts the token in the link fragment', () => {
    expect(manageLink('https://roma.se', { reservationId: 'r1' }, 'loc', 'tok')).toBe(
      'https://roma.se/bokning/loc/r1#tok',
    )
  })
})
