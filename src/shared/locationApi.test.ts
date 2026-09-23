import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BusinessHours } from './locationApi'

/** Miljöberoende värden läses vid modul-laddning - importera om per test. */
async function loadLocationApi(env: Record<string, string> = {}) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', env.VITE_API_BASE_URL ?? '')
  return import('./locationApi')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('getPublicLocationInfo', () => {
  it('hämtar publik platsinfo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          locationId: 'loc-1',
          name: 'Central Bistro',
          address: 'Main Street 1',
          timezone: 'Europe/Stockholm',
          businessHours: {},
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { getPublicLocationInfo } = await loadLocationApi({
      VITE_API_BASE_URL: 'https://api.example.com',
    })

    const info = await getPublicLocationInfo('loc-1')

    expect(info.name).toBe('Central Bistro')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://api.example.com/locations/loc-1/public-info')
  })

  it('översätter serverfel till ett kundvänligt meddelande', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 404 })),
    )
    const { getPublicLocationInfo } = await loadLocationApi({
      VITE_API_BASE_URL: 'https://api.example.com',
    })

    await expect(getPublicLocationInfo('loc-1')).rejects.toThrow(
      'Restaurangen kunde inte hittas',
    )
  })
})

describe('businessHoursToRows', () => {
  it('slår ihop intilliggande dagar med identiska tider', async () => {
    const { businessHoursToRows } = await loadLocationApi()
    const hours: BusinessHours = {
      monday: [{ opensAt: '11:00', closesAt: '22:00' }],
      tuesday: [{ opensAt: '11:00', closesAt: '22:00' }],
      wednesday: [{ opensAt: '11:00', closesAt: '22:00' }],
      thursday: [{ opensAt: '11:00', closesAt: '22:00' }],
      friday: [{ opensAt: '11:00', closesAt: '23:00' }],
      saturday: [{ opensAt: '12:00', closesAt: '23:00' }],
      sunday: [],
    }

    expect(businessHoursToRows(hours)).toEqual([
      { days: 'Mån–Tor', hours: '11:00–22:00' },
      { days: 'Fre', hours: '11:00–23:00' },
      { days: 'Lör', hours: '12:00–23:00' },
      { days: 'Sön', hours: 'Stängt' },
    ])
  })

  it('visar "Stängt" för dagar utan intervall och stödjer flera pass', async () => {
    const { businessHoursToRows } = await loadLocationApi()
    const hours: BusinessHours = {
      monday: [
        { opensAt: '11:00', closesAt: '14:00' },
        { opensAt: '17:00', closesAt: '22:00' },
      ],
    }

    const rows = businessHoursToRows(hours)
    expect(rows[0]).toEqual({ days: 'Mån', hours: '11:00–14:00, 17:00–22:00' })
    expect(rows[1]).toEqual({ days: 'Tis–Sön', hours: 'Stängt' })
  })
})
