/**
 * Säkerhetskontrollen på gästens formulär (AWS WAF): visar att en bokning,
 * beställning, cateringförfrågan, presentkort, köanmälan, biljett eller
 * nyhetsbrevsanmälan kommer från en människa på sajten och inte från ett
 * skript. Ersätter den tidigare widgeten; ingen ruta att klicka i.
 *
 * Så fungerar det: GET /site-config ger `botCheck.integrationUrl` (web
 * ACL:ens JavaScript-integration, infrastructure network/waf-sites). Sajten
 * laddar `<url>challenge.js`, som i bakgrunden bevisar en riktig webbläsare
 * och lägger en kortlivad cookie (aws-waf-token) på sajtens egen domän.
 * Formulären skickas sedan till `/api` på samma domän, där CloudFront kör
 * kontrollen och skickar vidare till API:t. Servern godtar dem bara den
 * vägen (application shared/bot_check.py).
 *
 * Lokalt (localhost) och på *.cloudfront.net finns ingen /api: där går
 * anropen direkt till API:t som förut.
 */

/** Formulären som kontrolleras (POST), sökvägar som i API:t. */
const GUARDED: readonly RegExp[] = [
  /^\/locations\/[^/]+\/reservations$/,
  /^\/locations\/[^/]+\/holds$/,
  /^\/order$/,
  /^\/locations\/[^/]+\/catering\/requests$/,
  /^\/m\/signup$/,
  /^\/public\/locations\/[^/]+\/gift-cards\/(checkout|balance)$/,
  /^\/public\/locations\/[^/]+\/events\/checkout$/,
  /^\/public\/locations\/[^/]+\/waitlist$/,
  // Sidans översättning (shared/lang): samma väg, så servern vet vilken sajt som frågar.
  /^\/translate$/,
]

/** Sökvägen på sajtens egen domän som CloudFront skickar till API:t. */
export const SAME_ORIGIN_API = '/api'

const SCRIPT_TIMEOUT_MS = 10_000

interface AwsWafIntegrationApi {
  getToken(): Promise<string>
  hasToken(): boolean
}

declare global {
  interface Window {
    AwsWafIntegration?: AwsWafIntegrationApi
  }
}

let integrationUrl: string | null = null
let loading: Promise<AwsWafIntegrationApi> | null = null

/** Sajten körs på en domän där CloudFront har /api (inte lokalt). */
export function sameOriginApiAvailable(): boolean {
  if (typeof window === 'undefined') return false
  const { protocol, hostname } = window.location
  if (protocol !== 'https:') return false
  return !(
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.cloudfront.net')
  )
}

/** Anropas med sajtkonfigurationen; laddar skriptet i förväg. */
export function configureBotCheck(config: { integrationUrl?: string | null } | null | undefined): void {
  const url = config?.integrationUrl?.trim() || null
  if (url !== integrationUrl) loading = null
  integrationUrl = url && /^https:\/\//.test(url) ? url : null
  if (integrationUrl && sameOriginApiAvailable()) void loadIntegration().catch(() => undefined)
}

/** Ska det här anropet gå via sajtens /api med säkerhetskontroll? */
export function isBotChecked(method: string, path: string): boolean {
  if (method !== 'POST' || !integrationUrl || !sameOriginApiAvailable()) return false
  const bare = path.split('?')[0]
  return GUARDED.some((re) => re.test(bare))
}

function loadIntegration(): Promise<AwsWafIntegrationApi> {
  if (window.AwsWafIntegration) return Promise.resolve(window.AwsWafIntegration)
  if (loading) return loading
  const url = integrationUrl
  if (!url) return Promise.reject(new Error('bot_check_unavailable'))
  loading = new Promise<AwsWafIntegrationApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${url.replace(/\/?$/, '/')}challenge.js`
    script.async = true
    const timer = window.setTimeout(() => reject(new Error('bot_check_unavailable')), SCRIPT_TIMEOUT_MS)
    script.onload = () => {
      window.clearTimeout(timer)
      if (window.AwsWafIntegration) resolve(window.AwsWafIntegration)
      else reject(new Error('bot_check_unavailable'))
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('bot_check_unavailable'))
    }
    document.head.appendChild(script)
  })
  // Ett misslyckat försök (t.ex. tappad uppkoppling) får göras om nästa gång.
  loading.catch(() => {
    loading = null
  })
  return loading
}

/** Ser till att sajten har en giltig token (cookie) innan formuläret skickas. */
export async function ensureBotCheckToken(): Promise<void> {
  const api = await loadIntegration()
  await api.getToken()
}

/** WAF svarade med en kontroll (202 + x-amzn-waf-action: challenge). */
export function isBotChallenge(res: Response): boolean {
  return res.status === 202 && res.headers?.get?.('x-amzn-waf-action') === 'challenge'
}

/** Bara för tester. */
export function resetBotCheck(): void {
  integrationUrl = null
  loading = null
}
