import { siteKitConfig } from '../config'
import { apiGet } from './api'
import type { BusinessHours } from './locationApi'
import { LOCATION_KEY_PREFIX, SLUG_KEY } from './storageRegistry'

/**
 * Vilken restaurang är det här?
 *
 * EN byggd sajt serveras på varje restaurangs egen domän. Vid start frågar
 * den API:t (GET /site-config?host=<hostname>) vilken restaurang domänen
 * tillhör och får allt den behöver: namn, varumärke, funktioner, platser,
 * juridisk person och publika nycklar. Ingen restaurangs data byggs in i
 * sajten.
 *
 * I dev (localhost, *.cloudfront.net) kan domänen inte avgöra
 * restaurangen, så den väljs med `?restaurang=<slug>` (sparas för resten av
 * besöket) eller byggvärdet VITE_DEV_TENANT_SLUG. API:t godtar slug bara
 * i dev.
 */

/** Kortgarantins villkor för en plats (null = inget kort krävs). Avgifter i kr. */
export interface GuaranteeTerms {
  minPartySize: number
  noShowFeePerPerson: number
  lateCancelFeePerPerson: number
  cancelCutoffHours: number
}

/** Avvikande dag (stängt, andra öppettider, ingen onlinebokning) - de
 * närmaste 60 dagarna. */
export interface SpecialDay {
  date: string
  kind: 'closed' | 'hours' | 'no_online'
  intervals?: { opensAt: string; closesAt: string }[]
  note?: string
}

export interface SiteLocation {
  locationId: string
  name: string | null
  address: string | null
  phoneNumber: string | null
  email: string | null
  timezone: string | null
  businessHours: BusinessHours
  bookingDurationHours: number | null
  maxPartySizeOnline: number | null
  guarantee?: GuaranteeTerms | null
  /** Hur länge bordet hålls för en sen gäst (null/saknas = inte angivet). */
  gracePeriodMinutes?: number | null
  specialDays?: SpecialDay[]
  /** Hur man kan beställa här (null/saknas = ingen beställning). */
  ordering?: { pickup: boolean; table: boolean; prepMinutes: number } | null
  /** Cateringkalkylen är påslagen för platsen (cateringSettings.enabled). */
  catering?: boolean
}

export interface SiteBranding {
  logoUrl?: string
  heroImageUrl?: string
  faviconUrl?: string
  primaryColor?: string
  accentColor?: string
  tagline?: string
  about?: string
  instagramUrl?: string
  facebookUrl?: string
}

export interface SiteConfig {
  tenant: {
    tenantId: string
    name: string
    slug: string | null
    branding: SiteBranding
    features: Record<string, boolean>
  }
  legal: {
    legalName: string
    orgNumber: string | null
    contactEmail: string | null
    contactPhone: string | null
    address: string | null
  }
  locations: SiteLocation[]
  stripe: { publishableKey: string | null; accountId: string | null }
  turnstile: { siteKey: string | null }
  /** Saknas från äldre backend: sidorna faller då tillbaka på standardtexterna. */
  privacy?: SitePrivacy
}

/** Restaurangens integritetstext, lagringstider och ordalydelsen för samtycke till erbjudanden. */
export interface SitePrivacy {
  notice: { body: string; version: number; updatedAt: string | null; custom: boolean }
  retention: { bookingDays: number; bookingMonths: number; guestMonths: number; cancelledMonths: number; accountingYears: number }
  /** null när restaurangen inte har marknadsföring påslaget: då visas ingen ruta. */
  marketingConsent: {
    version: string
    label: string
    channelQuestion: string
    channels: { value: ConsentChannel; label: string }[]
  } | null
}

export type ConsentChannel = 'email' | 'sms'

const SLUG_PARAM = 'restaurang'
const SLUG_STORAGE_KEY = SLUG_KEY
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** localhost / *.cloudfront.net / IP: domänen säger inget om restaurangen. */
export function isDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.cloudfront.net') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  )
}

function readStoredSlug(): string | null {
  try {
    return sessionStorage.getItem(SLUG_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeSlug(slug: string): void {
  try {
    sessionStorage.setItem(SLUG_STORAGE_KEY, slug)
  } catch {
    // Privat läge utan lagring: slugen gäller bara den här sidvisningen.
  }
}

/** Frågesträngen till /site-config för den här adressen, eller null. */
export function siteQuery(
  hostname: string,
  search: string,
  devSlug: string | undefined = siteKitConfig().devTenantSlug,
): string | null {
  if (!isDevHost(hostname)) {
    return `host=${encodeURIComponent(hostname.toLowerCase())}`
  }
  const fromUrl = new URLSearchParams(search).get(SLUG_PARAM)?.trim().toLowerCase()
  if (fromUrl && SLUG_PATTERN.test(fromUrl)) {
    storeSlug(fromUrl)
    return `slug=${encodeURIComponent(fromUrl)}`
  }
  const slug = (readStoredSlug() ?? devSlug ?? '').trim().toLowerCase()
  return SLUG_PATTERN.test(slug) ? `slug=${encodeURIComponent(slug)}` : null
}

export function getSiteConfig(query: string): Promise<SiteConfig> {
  return apiGet<SiteConfig>(`/site-config?${query}`)
}

// Vald plats minns per restaurang (bara bekvämlighet - servern äger listan).
const locationKey = (tenantId: string) => `${LOCATION_KEY_PREFIX}${tenantId}`

export function pickLocation(config: SiteConfig, preferred: string | null): SiteLocation | null {
  return (
    config.locations.find((l) => l.locationId === preferred) ?? config.locations[0] ?? null
  )
}

export function readStoredLocation(tenantId: string): string | null {
  try {
    return localStorage.getItem(locationKey(tenantId))
  } catch {
    return null
  }
}

export function storeLocation(tenantId: string, locationId: string): void {
  try {
    localStorage.setItem(locationKey(tenantId), locationId)
  } catch {
    // Som ovan.
  }
}
