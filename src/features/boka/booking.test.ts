import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBookingDate, gridPositions, labelTables, nextSevenDays } from './booking'

/** API_BASE_URL läses vid modul-laddning — importera om per test. */
async function loadBooking(baseUrl: string) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', baseUrl)
  return import('./booking')
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('nextSevenDays', () => {
  it('ger sju dagar med idag först', () => {
    const days = nextSevenDays(new Date('2026-08-17T10:00:00')) // en måndag
    expect(days).toHaveLength(7)
    expect(days[0]).toEqual({ date: '2026-08-17', weekday: 'Mån', dayOfMonth: '17' })
    expect(days[6]).toEqual({ date: '2026-08-23', weekday: 'Sön', dayOfMonth: '23' })
  })
})

describe('formatBookingDate', () => {
  it('formaterar som i designen: "Mån 17 augusti"', () => {
    expect(formatBookingDate('2026-08-17')).toBe('Mån 17 augusti')
  })
})

describe('labelTables', () => {
  it('numrerar borden i stabil ordning (API:t har ingen etikett)', () => {
    const labeled = labelTables([
      { tableId: 'table-9', seats: 2 },
      { tableId: 'table-2', seats: 4 },
    ])
    expect(labeled).toEqual([
      { tableId: 'table-2', label: 'Bord 1', seats: 4 },
      { tableId: 'table-9', label: 'Bord 2', seats: 2 },
    ])
  })
})

describe('gridPositions', () => {
  it('ger en position per bord, alla inom 0–100%', () => {
    const positions = gridPositions(5)
    expect(positions).toHaveLength(5)
    for (const p of positions) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(100)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(100)
    }
  })

  it('ger tom lista för noll bord', () => {
    expect(gridPositions(0)).toEqual([])
  })
})

describe('fetchAvailability', () => {
  it('hämtar slots direkt från den publika availability-rutten', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          locationId: 'loc-1',
          date: '2026-09-25',
          timezone: 'Europe/Stockholm',
          slots: [
            { startTime: '18:00', endTime: '20:00', tables: [{ tableId: 't1', seats: 4 }] },
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { fetchAvailability } = await loadBooking('https://api.example.com')

    const result = await fetchAvailability('loc-1', '2026-09-25')

    expect(result).toEqual({
      status: 'ok',
      slots: [
        { startTime: '18:00', endTime: '20:00', tables: [{ tableId: 't1', seats: 4 }] },
      ],
    })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://api.example.com/locations/loc-1/availability?date=2026-09-25')
  })

  it('visar ärligt fel i stället för att hitta på tider vid ett API-fel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 503 })),
    )
    const { fetchAvailability } = await loadBooking('https://api.example.com')

    const result = await fetchAvailability('loc-1', '2026-09-25')

    expect(result.status).toBe('error')
  })

  it('en tom slot-lista räknas som ok — inga hittade-på tider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ locationId: 'loc-1', date: '2026-09-25', slots: [] }), {
          status: 200,
        }),
      ),
    )
    const { fetchAvailability } = await loadBooking('https://api.example.com')

    const result = await fetchAvailability('loc-1', '2026-09-25')

    expect(result).toEqual({ status: 'ok', slots: [] })
  })
})
