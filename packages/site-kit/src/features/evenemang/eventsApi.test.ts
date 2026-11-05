import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureSiteKit } from '../../config'
import { ApiError } from '../../shared/api'
import { cancelGift, checkout, eventsErrorMessage, getTickets, kr, maxFor, passUrl, time, tokenFromHash, when } from './eventsApi'
import type { PublicOccurrence, PublicTicketType } from './eventsApi'

afterEach(() => vi.unstubAllGlobals())

describe('eventsApi', () => {
  it('calls the public routes on the API base, never with credentials', async () => {
    configureSiteKit({ apiBaseUrl: 'https://api.test' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ amountSek: 0, expiresAt: 'x' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await checkout('loc 1', { orderId: 'o1234567', occurrenceId: 'e-1', lines: [{ typeId: 't', qty: 1 }], buyerName: 'A', buyerEmail: 'a@b.se' })
    await getTickets('abc.def')
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('https://api.test/public/locations/loc%201/events/checkout')
    expect(calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit' })
    expect(calls[1][0]).toBe('https://api.test/public/tickets/abc.def')
    expect(passUrl('abc.def', 'tk1', 'apple')).toBe('https://api.test/public/tickets/abc.def/pass?ticketId=tk1&kind=apple')
  })

  it('treats the 204 of a cancelled gift as done', async () => {
    configureSiteKit({ apiBaseUrl: 'https://api.test' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(cancelGift('abc.def', 'tr1')).resolves.toBeNull()
  })

  it('reads the token from the fragment and refuses anything else', () => {
    expect(tokenFromHash('#bzp0OjAx.c2ln')).toBe('bzp0OjAx.c2ln')
    expect(tokenFromHash('')).toBeNull()
    expect(tokenFromHash('#<script>')).toBeNull()
    expect(tokenFromHash(`#${'a'.repeat(130)}.b`)).toBeNull()
  })

  it('caps a type by its own max, its seats, the order max and the seats left', () => {
    const occ: PublicOccurrence = { occurrenceId: 'o', startAt: 'x', left: 5, soldOut: false }
    const type: PublicTicketType = { typeId: 't', name: 'T', priceSek: 1, perOrderMax: 4, available: true }
    expect(maxFor(type, occ, 10, 0)).toBe(4)
    expect(maxFor({ ...type, left: 2 }, occ, 10, 0)).toBe(2)
    expect(maxFor(type, occ, 6, 3)).toBe(2)
    expect(maxFor(type, occ, 10, 4)).toBe(1)
    expect(maxFor({ ...type, available: false }, occ, 10, 0)).toBe(0)
    expect(maxFor(type, undefined, 10, 0)).toBe(0)
  })

  it('turns the API error codes into Swedish', () => {
    expect(eventsErrorMessage(new ApiError(409, 'x', { code: 'sales_closed' }), 'f')).toMatch(/stängd/)
    expect(eventsErrorMessage(new ApiError(500, 'x', {}), 'Försök igen.')).toBe('Försök igen.')
  })

  it('formats money and times in Swedish and the location time zone', () => {
    expect(kr(1350)).toBe('1 350 kr')
    expect(when('2026-11-20T18:00:00Z', 'Europe/Stockholm')).toBe('fredag 20 november kl. 19:00')
    expect(time('2026-07-01T18:00:00Z', null)).toBe('20:00')
    expect(when('nope')).toBe('')
  })
})

describe('clampQty and codeOf', () => {
  it('keeps each type within what can be bought now, in order', async () => {
    const { clampQty, codeOf } = await import('./eventsApi')
    const occ: PublicOccurrence = { occurrenceId: 'o', startAt: 'x', left: 3, soldOut: false }
    const a: PublicTicketType = { typeId: 'a', name: 'A', priceSek: 1, perOrderMax: 4, available: true }
    const b: PublicTicketType = { typeId: 'b', name: 'B', priceSek: 1, perOrderMax: 4, available: true }
    expect(clampQty({ a: 2, b: 2 }, [a, b], occ, 10)).toEqual({ a: 2, b: 1 })
    expect(clampQty({ a: 2 }, [a], { ...occ, left: 0 }, 10)).toEqual({})
    expect(codeOf(new ApiError(409, 'x', { error: 'sold_out' }))).toBe('sold_out')
    expect(codeOf(new Error('x'))).toBeNull()
  })
})
