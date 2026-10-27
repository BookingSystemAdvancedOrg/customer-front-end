/**
 * API-lager för kundsajten.
 *
 * Säkerhetsmodell: sajten är helt publik. Den har ingen inloggning, inga
 * API-nycklar och inga cookies. Den läser publika rutter (sajtkonfiguration,
 * meny, planritning, lediga tider) och skickar gästens egna skrivanrop:
 * hålla valt bord (15 min) och släppa det, bokningen (inkl. att slutföra
 * kortgarantin) och avbokningen. Den enda "behörigheten" är
 * gästens hanteringstoken för sin egen bokning, som skickas som header
 * (X-Manage-Token) - aldrig i URL:en, så den hamnar inte i loggar.
 */

import { siteKitConfig } from '../config'

/** API:ts bas-URL från sajtens configureSiteKit (läses vid varje anrop). */
export function apiBaseUrl(): string | undefined {
  return siteKitConfig().apiBaseUrl || undefined
}

export function isApiConfigured(): boolean {
  const base = apiBaseUrl()
  return Boolean(base) && !base?.includes('REPLACE_ME')
}

/** Statuskod + API:ts felkod (t.ex. 409 "table_taken") bevaras. */
export class ApiError extends Error {
  status: number
  /** Hela felsvaret (t.ex. {"error": "fee_applies", "fee": 30000}). */
  body: Record<string, unknown>

  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: string; message?: string }
    return new ApiError(res.status, body.error ?? body.message ?? text, body as Record<string, unknown>)
  } catch {
    return new ApiError(res.status, text || res.statusText)
  }
}

/**
 * Omförsök, så att ett tillfälligt "upptaget" inte blir ett fel för gästen:
 * - 429 utan lång Retry-After = API Gatewayns tak - anropet kördes aldrig,
 *   så alla metoder får försöka igen. Vår egen spärr per gäst (429 med
 *   lång Retry-After) försöks inte om.
 * - Läsningar (GET) försöker också igen vid 502/503/504 och tappad
 *   anslutning. Skrivanrop gör det inte - de kan redan ha gått igenom.
 */
export const RETRY_DELAYS_MS: readonly number[] = import.meta.env.MODE === 'test' ? [0, 0] : [400, 1200]
const MAX_RETRY_AFTER_MS = 3_000

function retryAfterMs(res: Response): number {
  const raw = res.headers?.get?.('Retry-After')
  if (raw == null || raw === '') return 0
  const seconds = Number(raw)
  return Number.isFinite(seconds) ? seconds * 1000 : Number.POSITIVE_INFINITY
}

function worthRetrying(method: string, res: Response): boolean {
  if (res.status === 429) return retryAfterMs(res) <= MAX_RETRY_AFTER_MS
  return method === 'GET' && (res.status === 502 || res.status === 503 || res.status === 504)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(method: string, send: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length
    let res: Response
    try {
      res = await send()
    } catch (err) {
      // Bara en tappad anslutning (TypeError) på en läsning - inte timeout.
      if (last || method !== 'GET' || !(err instanceof TypeError)) throw err
      await wait(RETRY_DELAYS_MS[attempt])
      continue
    }
    if (last || res.ok || !worthRetrying(method, res)) return res
    await wait(Math.max(RETRY_DELAYS_MS[attempt], retryAfterMs(res)))
  }
}

/** Hur länge vi väntar på API:t innan anropet ges upp (per försök). */
const REQUEST_TIMEOUT_MS = 15_000

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  { body, headers, keepalive }: { body?: unknown; headers?: Record<string, string>; keepalive?: boolean } = {},
): Promise<T> {
  if (!isApiConfigured()) {
    throw new Error('VITE_API_BASE_URL är inte satt - se .env.example och README.')
  }
  const res = await fetchWithRetry(method, () => fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Inga cookies eller sparade inloggningar följer någonsin med anropet.
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    // keepalive: anropet hinner iväg även när sidan stängs (släppa ett bord).
    ...(keepalive ? { keepalive: true } : { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  }))
  if (!res.ok) {
    throw await toApiError(res)
  }
  return (await res.json()) as T
}

/**
 * Hämtar JSON från en publik GET-rutt. `path` ska börja med `/` och byggs
 * alltid ovanpå apiBaseUrl() - anroparen kan inte peka om mot en annan host.
 */
export function apiGet<T>(path: string, headers?: Record<string, string>): Promise<T> {
  return request<T>('GET', path, { headers })
}

/** POST mot en publik rutt (bokning / avbokning). */
export function apiPost<T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return request<T>('POST', path, { body, headers })
}

/** DELETE mot en publik rutt (släppa ett hållet bord). */
export function apiDelete<T>(
  path: string,
  headers?: Record<string, string>,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<T> {
  return request<T>('DELETE', path, { headers, keepalive })
}
