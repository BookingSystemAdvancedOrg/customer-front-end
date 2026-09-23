/**
 * Skrivskyddat API-lager för kundsajten.
 *
 * Säkerhetsmodell: sajten är helt publik. Den har ingen inloggning, inga
 * tokens, inga API-nycklar och ingen skrivbehörighet - den anropar bara
 * backendens publika GET-rutter (t.ex. GET /locations/{id}/menu, som API:ts
 * JWT-authorizer uttryckligen släpper igenom utan token). Därför exponerar
 * modulen enbart `apiGet`: det finns ingen väg att uttrycka POST/PUT/DELETE
 * härifrån, och ingen Authorization-header skickas någonsin.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined

export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL)
}

/** Samma feltyp som admin-appen: statuskoden bevaras för anroparna. */
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

/**
 * Hämtar JSON från en publik GET-rutt. `path` ska börja med `/` och byggs
 * alltid ovanpå API_BASE_URL - anroparen kan inte peka om mot en annan host.
 */
export async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL är inte satt - se .env.example och README.',
    )
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
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
