/**
 * Sidans data och översättningen av den, utan att importera React eller
 * api.ts (api.ts importerar den här filen).
 *
 * - `trackLoad`: varje publik GET räknas medan den pågår, så att
 *   LanguageProvider håller sidan dold tills första datan (meny, catering)
 *   är hämtad och översatt, i stället för att byta text framför gästen
 *   (layoutskift).
 * - `prefetchTexts`: data som ska visas (rättbeskrivningar, kategorier)
 *   översätts innan den sätts in i sidan, så att träffarna skrivs i samma
 *   ritning som noderna. Väntar högst `PREFETCH_MAX_MS`; därefter visas
 *   datan och svenskan byts när översättningen kommer.
 */

export const PREFETCH_MAX_MS = 1_500

let inflight = 0
let waiters: (() => void)[] = []

function settle(): void {
  if (inflight > 0 || !waiters.length) return
  const w = waiters
  waiters = []
  for (const fn of w) fn()
}

/** Räknar ett anrop medan det pågår (även när det misslyckas). */
export function trackLoad<T>(promise: Promise<T>): Promise<T> {
  inflight++
  return promise.finally(() => {
    inflight--
    settle()
  })
}

export function loadsInFlight(): number {
  return inflight
}

/** Löser när inga anrop pågår. */
export function whenLoadsSettled(): Promise<void> {
  if (inflight === 0) return Promise.resolve()
  return new Promise((resolve) => waiters.push(resolve))
}

type Prefetcher = (texts: string[]) => Promise<void>
let prefetcher: Prefetcher | null = null

/** Sätts av LanguageProvider medan ett annat språk än svenska visas. */
export function setPrefetcher(fn: Prefetcher | null): void {
  prefetcher = fn
}

/** Översätter texter innan de visas (högst `maxMs`). Svenska: gör ingenting. */
export function prefetchTexts(
  texts: Iterable<string | null | undefined>,
  maxMs: number = PREFETCH_MAX_MS,
): Promise<void> {
  const fn = prefetcher
  if (!fn) return Promise.resolve()
  const list = [...texts].filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  if (!list.length) return Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, maxMs)
  })
  return trackLoad(Promise.race([fn(list).catch(() => {}), timeout]).finally(() => clearTimeout(timer)))
}
