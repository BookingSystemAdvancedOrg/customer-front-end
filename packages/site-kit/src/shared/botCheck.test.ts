import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const INTEGRATION = 'https://abc123.eu-north-1.sdk.awswaf.com/abc123/def456/'
const BOOKING = '/locations/loc-1/reservations'

type Waf = { getToken: ReturnType<typeof vi.fn>; hasToken: () => boolean }

/**
 * jsdom:s window.location går inte att byta, så testerna ger modulerna ett
 * eget window med den adress (och den WAF-integration) som testet behöver.
 */
function stubWindow(href: string, waf?: Waf) {
  const url = new URL(href)
  vi.stubGlobal('window', {
    location: { protocol: url.protocol, hostname: url.hostname },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    ...(waf ? { AwsWafIntegration: waf } : {}),
  })
}

function wafStub(): Waf {
  return { getToken: vi.fn().mockResolvedValue('token'), hasToken: () => true }
}

/** Färska moduler per test (botCheck har sitt tillstånd i modulen). */
async function load(integrationUrl: string | null = INTEGRATION) {
  vi.resetModules()
  const { configureSiteKit } = await import('../config')
  configureSiteKit({ apiBaseUrl: 'https://api.test' })
  const botCheck = await import('./botCheck')
  const api = await import('./api')
  botCheck.configureBotCheck({ integrationUrl })
  return { ...botCheck, ...api }
}

function ok(body: unknown = { ok: true }, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const challenge = () => new Response('', { status: 202, headers: { 'x-amzn-waf-action': 'challenge' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => ok())
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.querySelectorAll('script[src$="challenge.js"]').forEach((s) => s.remove())
})

describe('isBotChecked', () => {
  it('is true only for POST to the guarded forms on the real https site', async () => {
    stubWindow('https://example.se/boka', wafStub())
    const { isBotChecked } = await load()
    for (const path of [
      BOOKING,
      '/locations/loc-1/holds',
      '/order',
      '/locations/loc-1/catering/requests',
      '/m/signup',
      '/public/locations/loc-1/gift-cards/checkout',
      '/public/locations/loc-1/gift-cards/balance',
      '/public/locations/loc-1/events/checkout',
      '/public/locations/loc-1/waitlist',
      `${BOOKING}?x=1`,
    ]) {
      expect(isBotChecked('POST', path), path).toBe(true)
    }
    expect(isBotChecked('GET', BOOKING)).toBe(false)
    expect(isBotChecked('DELETE', '/locations/loc-1/holds')).toBe(false)
    expect(isBotChecked('POST', '/locations/loc-1/reservations/r1/cancel')).toBe(false)
    expect(isBotChecked('POST', '/m/code')).toBe(false)
  })

  it('is false without an integration URL', async () => {
    stubWindow('https://example.se/', wafStub())
    const { isBotChecked } = await load(null)
    expect(isBotChecked('POST', BOOKING)).toBe(false)
  })

  it.each([
    'http://localhost:5173/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://site.localhost/',
    'https://d111111abcdef8.cloudfront.net/',
    'http://example.se/',
  ])('is false on %s (no same-origin /api there)', async (href) => {
    stubWindow(href, wafStub())
    const { isBotChecked } = await load()
    expect(isBotChecked('POST', BOOKING)).toBe(false)
  })
})

describe('api with the bot check', () => {
  it('sends a guarded POST to the site\'s own /api with the WAF cookie after getting a token', async () => {
    const waf = wafStub()
    stubWindow('https://example.se/boka', waf)
    const { apiPost } = await load()
    await apiPost(BOOKING, { a: 1 })
    expect(waf.getToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api${BOOKING}`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect(JSON.parse(String(init.body))).toEqual({ a: 1 })
  })

  it('still sends other calls straight to the API without cookies', async () => {
    const waf = wafStub()
    stubWindow('https://example.se/boka', waf)
    const { apiGet, apiPost } = await load()
    await apiGet('/locations/loc-1/availability?date=2026-11-20')
    await apiPost('/locations/loc-1/reservations/r1/cancel', {})
    expect(waf.getToken).not.toHaveBeenCalled()
    const calls = fetchMock.mock.calls as [string, RequestInit][]
    expect(calls.map(([url]) => url)).toEqual([
      'https://api.test/locations/loc-1/availability?date=2026-11-20',
      'https://api.test/locations/loc-1/reservations/r1/cancel',
    ])
    for (const [, init] of calls) expect(init.credentials).toBe('omit')
  })

  it('sends guarded posts straight to the API on localhost', async () => {
    const waf = wafStub()
    stubWindow('http://localhost:5173/boka', waf)
    const { apiPost } = await load()
    await apiPost(BOOKING, {})
    expect(waf.getToken).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://api.test${BOOKING}`)
    expect(init.credentials).toBe('omit')
  })

  it('retries once with a fresh token when WAF answers with a challenge', async () => {
    const waf = wafStub()
    stubWindow('https://example.se/boka', waf)
    fetchMock.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(ok({ reservationId: 'r1' }, 201))
    const { apiPost } = await load()
    await expect(apiPost(BOOKING, {})).resolves.toEqual({ reservationId: 'r1' })
    expect(waf.getToken).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up with bot_check_failed when the retry is challenged again', async () => {
    const waf = wafStub()
    stubWindow('https://example.se/boka', waf)
    fetchMock.mockImplementation(async () => challenge())
    const { apiPost, ApiError } = await load()
    const err = await apiPost(BOOKING, {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ message: 'bot_check_failed', status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws bot_check_unavailable when the WAF script cannot load', async () => {
    stubWindow('https://example.se/boka')
    const { apiPost, ApiError } = await load()
    const pending = apiPost(BOOKING, {}).catch((e: unknown) => e)
    const script = document.head.querySelector<HTMLScriptElement>('script[src$="challenge.js"]')
    expect(script?.src).toBe(`${INTEGRATION}challenge.js`)
    script!.dispatchEvent(new Event('error'))
    const err = await pending
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ message: 'bot_check_unavailable', status: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
