import { apiPost } from '../api'
import { isBotChecked } from '../botCheck'
import type { Lang } from './languages'

/**
 * POST /translate (application functions/site-translate). Går som
 * säkerhetskontrollerat formulär via /api på sajtens egen domän (botCheck
 * GUARDED), så servern vet vilken restaurang som frågar från domänen. Lokalt
 * och på *.cloudfront.net går anropet direkt till API:t och namnger
 * restaurangen med slug (godtas bara utanför prod).
 */

export const MAX_TEXTS = 100
export const MAX_TEXT_CHARS = 3_000
export const MAX_REQUEST_CHARS = 20_000
export const MAX_KEEP = 200
export const MAX_KEEP_CHARS = 120

export interface TranslateResponse {
  lang: string
  texts: string[]
  partial?: boolean
}

export async function translateTexts(
  lang: Exclude<Lang, 'sv'>,
  texts: string[],
  keep: string[],
  slug?: string | null,
): Promise<TranslateResponse> {
  const body: Record<string, unknown> = { lang, texts }
  if (keep.length) body.keep = keep.slice(0, MAX_KEEP)
  if (slug && !isBotChecked('POST', '/translate')) body.slug = slug
  const res = await apiPost<TranslateResponse>('/translate', body)
  if (!res || !Array.isArray(res.texts) || res.texts.length !== texts.length) {
    throw new Error('translate_bad_response')
  }
  return res
}

/** Delar upp strängar i anrop om högst 100 strängar och 20 000 tecken. */
export function chunkTexts(texts: string[]): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let chars = 0
  for (const t of texts) {
    if (current.length && (current.length >= MAX_TEXTS || chars + t.length > MAX_REQUEST_CHARS)) {
      chunks.push(current)
      current = []
      chars = 0
    }
    current.push(t)
    chars += t.length
  }
  if (current.length) chunks.push(current)
  return chunks
}

/** Termer som aldrig får översättas (namn, adresser, rätter): längst först, högst 200. */
export function normaliseKeep(terms: Iterable<string | null | undefined>): string[] {
  const set = new Set<string>()
  for (const t of terms) {
    const v = t?.trim()
    if (v && v.length <= MAX_KEEP_CHARS && /\p{L}/u.test(v)) set.add(v)
  }
  return [...set].sort((a, b) => b.length - a.length).slice(0, MAX_KEEP)
}
