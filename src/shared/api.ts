/**
 * API-lager för kundsajten.
 *
 * Säkerhetsmodell: sajten är helt publik. Den har ingen inloggning, inga
 * API-nycklar och inga cookies. Den läser publika rutter (sajtkonfiguration,
 * meny, planritning, lediga tider) och skickar exakt två sorters skrivanrop:
 * en gästs bokning och en gästs avbokning. Den enda "behörigheten" är
 * gästens hanteringstoken för sin egen bokning, som skickas som header
 * (X-Manage-Token) - aldrig i URL:en, så den hamnar inte i loggar.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL) && !API_BASE_URL?.includes('REPLACE_ME')
}

/** Statuskod + API:ts felkod (t.ex. 409 "table_taken") bevaras. */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: string; message?: string }
    return new ApiError(res.status, body.error ?? body.message ?? text)
  } catch {
    return new ApiError(res.status, text || res.statusText)
  }
}

/** Hur länge vi väntar på API:t innan anropet ges upp. */
const REQUEST_TIMEOUT_MS = 15_000

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  { body, headers }: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  if (!isApiConfigured()) {
    throw new Error('VITE_API_BASE_URL är inte satt - se .env.example och README.')
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw await toApiError(res)
  }
  return (await res.json()) as T
}

/**
 * Hämtar JSON från en publik GET-rutt. `path` ska börja med `/` och byggs
 * alltid ovanpå API_BASE_URL - anroparen kan inte peka om mot en annan host.
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
