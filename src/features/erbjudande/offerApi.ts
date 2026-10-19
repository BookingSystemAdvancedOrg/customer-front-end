import { ApiError, apiGet, apiPost } from '../../shared/api'

/**
 * Välkomsterbjudandet (restaurangen ställer in det under Marknadsföring i
 * admin): ett litet kort där gästen lämnar sin e-post, säger ja till
 * erbjudanden och får en rabattkod som gäller en gång. Backend:
 * application/functions/marketing-public (GET /m/offer, POST /m/signup,
 * POST /m/code).
 */

export interface Offer {
  percent: number
  minOrderOre: number
  validDays: number
  headline: string
  text: string
  buttonLabel: string
  imageUrl: string | null
  dishName: string | null
  delaySeconds: number
  scrollPercent: number
  /** 'all' = alla sidor utom bokning, beställning och kassan; 'menu' = bara menyn. */
  pages: 'all' | 'menu'
  /** 'visit' = en gång per besök; 'page' = på varje sida tills gästen stänger det. */
  frequency: 'visit' | 'page'
  showOnMobile: boolean
}

/** Sidor där kortet aldrig stör: bokning, beställning, kassan, juridik. */
const NEVER = [/^\/boka-bord/, /^\/bestall/, /^\/bokning\//, /^\/catering/, /^\/integritetspolicy/, /^\/bokningsvillkor/]

export function offerAllowedOn(pathname: string, pages: Offer['pages']): boolean {
  if (NEVER.some((re) => re.test(pathname))) return false
  if (pages === 'menu') return pathname === '/' || pathname === '/meny'
  return true
}

export interface CodeTerms {
  code: string
  percent: number
  minOrderOre: number
  expiresAt: string
}

export async function getOffer(locationId: string): Promise<Offer | null> {
  const out = await apiGet<{ offer: Offer | null }>(`/m/offer?locationId=${encodeURIComponent(locationId)}`)
  return out.offer
}

export function signUp(body: {
  locationId: string
  email: string
  consent: true
  turnstileToken?: string
}): Promise<{ sent: true; expiresAt?: string }> {
  return apiPost('/m/signup', body)
}

export function checkCode(locationId: string, code: string): Promise<CodeTerms> {
  return apiPost('/m/code', { locationId, code })
}

/** ABCD-EFGH, eller null om det inte kan vara en kod. */
export function normalizeCode(value: string): string | null {
  const raw = value.replace(/[\s-]/g, '').toUpperCase()
  if (!/^[A-Z2-9]{8}$/.test(raw)) return null
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

/** Rabatten per enhet avrundad som servern gör (moms per rad stämmer då). */
export function discounted(unitOre: number, percent: number): number {
  return Math.round((unitOre * (100 - percent)) / 100)
}

const SIGNUP_ERRORS: Record<string, string> = {
  offer_already_used: 'Den här e-postadressen har redan använt erbjudandet.',
  offer_expired: 'Koden som skickades till den här adressen har gått ut.',
  no_offer: 'Erbjudandet är inte längre aktivt.',
  too_many_requests: 'För många försök. Vänta en stund och försök igen.',
  verification_unavailable: 'Säkerhetskontrollen svarar inte just nu. Försök igen om en stund.',
}

export function signupErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (SIGNUP_ERRORS[err.message]) return SIGNUP_ERRORS[err.message]
    if (err.status === 429) return SIGNUP_ERRORS.too_many_requests
    if (/^email/.test(err.message)) return 'Fyll i en giltig e-postadress.'
    if (/^turnstile/.test(err.message)) return 'Bekräfta säkerhetskontrollen och försök igen.'
  }
  return 'Det gick inte att skicka koden just nu. Försök igen om en stund.'
}

const CODE_ERRORS: Record<string, string> = {
  discount_invalid: 'Koden känns inte igen.',
  discount_expired: 'Koden har gått ut.',
  discount_used: 'Koden är redan använd.',
}

export function codeErrorMessage(err: unknown): string {
  if (err instanceof ApiError && CODE_ERRORS[err.message]) return CODE_ERRORS[err.message]
  if (err instanceof ApiError && err.status === 429) return SIGNUP_ERRORS.too_many_requests
  return 'Koden kunde inte kontrolleras just nu.'
}
