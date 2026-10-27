import { apiBaseUrl, isApiConfigured } from './api'

/**
 * Besöksstatistik och kampanjspårning, utan cookies.
 *
 * - Sparar ingenting i webbläsaren (ingen cookie, localStorage eller
 *   sessionStorage) och skapar inget besökar-id. Därför behövs ingen
 *   samtyckesbanner.
 * - Varje sidvisning skickar ett litet anrop (POST /t) med plats, sökväg,
 *   vilken sida besökaren kom ifrån och eventuella kampanjtaggar
 *   (utm_source, utm_medium, utm_campaign, bq_c). API:t räknar dem per dag
 *   och kanal; det sparar varken IP-adress eller hänvisande adress.
 * - Kampanjtaggarna hålls i minnet medan sidan är öppen och följer med
 *   bokning, beställning och cateringförfrågan (`attribution`), så att
 *   restaurangen ser vilken kampanj som gav bokningen.
 * - Bara när restaurangen har marknadsföring i sin plan.
 */

export interface Attribution {
  source?: string
  medium?: string
  campaign?: string
  campaignId?: string
}

// Samma tecken som API:t godtar (shared/marketing.py _TAG).
const TAG = /^[\w\- .:/åäöÅÄÖ]{1,60}$/
const CAMPAIGN_ID = /^[0-9a-f]{16}$/

let attribution: Attribution | null = null
let referrer: string | null = null
let captured = false
let firstSent = false

function tag(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim()
  return value && TAG.test(value) ? value.toLowerCase() : undefined
}

/** Läser kampanjtaggarna i adressen besökaren kom in på (en gång per sidladdning). */
export function captureAttribution(search: string = window.location.search, ref: string = document.referrer): void {
  if (captured) return
  captured = true
  const params = new URLSearchParams(search)
  const found: Attribution = {
    source: tag(params, 'utm_source'),
    medium: tag(params, 'utm_medium'),
    campaign: tag(params, 'utm_campaign'),
  }
  const id = params.get('bq_c')
  if (id && CAMPAIGN_ID.test(id)) found.campaignId = id
  const clean = Object.fromEntries(Object.entries(found).filter(([, v]) => v)) as Attribution
  attribution = Object.keys(clean).length ? clean : null
  try {
    // Bara en annan sajts värdnamn (www.google.com), aldrig sökväg eller
    // frågesträng; egna sidbyten räknas inte som hänvisning.
    const url = ref ? new URL(ref) : null
    referrer = url && url.host !== window.location.host ? `${url.protocol}//${url.hostname}/` : null
  } catch {
    referrer = null
  }
}

/** Det som följer med en bokning, beställning eller cateringförfrågan. */
export function currentAttribution(): Attribution | undefined {
  return attribution ?? undefined
}

/** Lägger till `attribution` på ett anrops body när det finns något. */
export function withAttribution<T extends object>(body: T): T & { attribution?: Attribution } {
  const a = currentAttribution()
  return a ? { ...body, attribution: a } : body
}

/**
 * Räknar en sidvisning. Den första efter en sidladdning är ett besök.
 * Fel ignoreras: statistiken får aldrig störa gästen.
 */
export function trackPage(locationId: string, path: string): void {
  if (!isApiConfigured() || !locationId) return
  captureAttribution()
  const visit = !firstSent
  firstSent = true
  const body = {
    locationId,
    type: visit ? 'visit' : 'page',
    // Bara första delen av sökvägen (/boka-bord), aldrig boknings- eller beställnings-id.
    path: `/${path.split('/').filter(Boolean)[0] ?? ''}`.slice(0, 60),
    // Hela besöket räknas på kanalen det började från.
    ...(referrer ? { referrer } : {}),
    ...(attribution ?? {}),
  }
  try {
    // text/plain = inget CORS-förfrågningsanrop; keepalive = hinner iväg
    // även om gästen lämnar sidan direkt.
    void fetch(`${apiBaseUrl()}/t`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // ingen statistik den här gången
  }
}

/** Välkomsterbjudandets kort visades (räknas på erbjudandet, inte som besök). */
export function trackOfferView(locationId: string): void {
  if (!isApiConfigured() || !locationId) return
  try {
    void fetch(`${apiBaseUrl()}/t`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ locationId, type: 'offer' }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // ingen statistik den här gången
  }
}

/** Endast för tester. */
export function resetVisitsForTests(): void {
  attribution = null
  referrer = null
  captured = false
  firstSent = false
}
