import { afterEach, describe, expect, it, vi } from 'vitest'

/** Varje test sätter sin API-adress och importerar om modulen. */
async function loadApi(baseUrl: string | undefined) {
  vi.resetModules()
  const { configureSiteKit } = await import('../config')
  configureSiteKit({ apiBaseUrl: baseUrl ?? '' })
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
    // Kundsajten har ingen inloggning - ingen Authorization får någonsin
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

describe('omförsök', () => {
  const status = (code: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: 'x' }), { status: code, headers })

  it('försöker igen när API Gateway svarar 429 (även för en beställning)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(okResponse({ orderId: 'o1' }))
    vi.stubGlobal('fetch', fetchMock)
    const { apiPost } = await loadApi('https://api.example.com')

    await expect(apiPost('/order', { a: 1 })).resolves.toEqual({ orderId: 'o1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('försöker inte igen vid vår egen spärr (429 med lång Retry-After)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(429, { 'Retry-After': '600' }))
    vi.stubGlobal('fetch', fetchMock)
    const { apiPost } = await loadApi('https://api.example.com')

    await expect(apiPost('/order', {})).rejects.toMatchObject({ status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('läsningar försöker igen vid 503 och tappad anslutning, högst tre gånger', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(status(503))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { apiGet } = await loadApi('https://api.example.com')

    await expect(apiGet('/x')).resolves.toEqual({ items: [] })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fetchMock.mockReset().mockImplementation(() => Promise.resolve(status(503)))
    await expect(apiGet('/x')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('skrivanrop försöker inte igen vid 503 - de kan redan ha gått igenom', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(status(503)))
    vi.stubGlobal('fetch', fetchMock)
    const { apiPost } = await loadApi('https://api.example.com')

    await expect(apiPost('/order', {})).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
