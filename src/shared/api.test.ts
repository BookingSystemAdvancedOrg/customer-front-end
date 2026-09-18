import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * API_BASE_URL läses vid modul-laddning, så varje test stubbar miljön och
 * importerar om modulen med vi.resetModules + dynamisk import.
 */
async function loadApi(baseUrl: string | undefined) {
  vi.resetModules()
  if (baseUrl === undefined) {
    vi.stubEnv('VITE_API_BASE_URL', '')
  } else {
    vi.stubEnv('VITE_API_BASE_URL', baseUrl)
  }
  return import('./api')
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('apiGet', () => {
  it('kastar ett begripligt fel när API-bas-URL saknas', async () => {
    const { apiGet } = await loadApi(undefined)
    await expect(apiGet('/x')).rejects.toThrow('VITE_API_BASE_URL är inte satt')
  })

  it('gör ett GET-anrop utan Authorization och utan cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { apiGet } = await loadApi('https://api.example.com')

    await apiGet('/locations/abc/menu')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/locations/abc/menu')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('omit')
    // Kundsajten har ingen inloggning — ingen Authorization får någonsin
    // skickas, oavsett vad som ligger i webbläsarens lagring.
    expect(
      Object.keys((init.headers ?? {}) as Record<string, string>),
    ).not.toContain('Authorization')
  })

  it('gör om ett API-fel till ApiError med status och meddelande', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'location not found' }), {
          status: 404,
        }),
      ),
    )
    const { apiGet, ApiError } = await loadApi('https://api.example.com')

    const err = await apiGet('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as InstanceType<typeof ApiError>).status).toBe(404)
    expect((err as Error).message).toBe('location not found')
  })
})
