import type { SiteConfig } from '../shared/site'

export const LOCATION_ID = 'loc-1'

export function siteConfig(over: Partial<SiteConfig['tenant']> = {}): SiteConfig {
  return {
    tenant: {
      tenantId: 't-1',
      name: 'Testkrogen',
      slug: 'testkrogen',
      branding: { tagline: 'God mat' },
      features: { reservations: true, ordering: false, catering: false, terminal: false },
      ...over,
    },
    legal: {
      legalName: 'Testkrogen AB',
      orgNumber: '556677-8899',
      contactEmail: 'info@testkrogen.se',
      contactPhone: '+46812345678',
      address: 'Gatan 1, Stockholm',
    },
    locations: [
      {
        locationId: LOCATION_ID,
        name: 'Testkrogen City',
        address: 'Gatan 1, Stockholm',
        phoneNumber: '08-123 456 78',
        email: 'city@testkrogen.se',
        timezone: 'Europe/Stockholm',
        businessHours: { monday: [{ opensAt: '11:00', closesAt: '22:00' }] },
        bookingDurationHours: 2,
        maxPartySizeOnline: 8,
      },
    ],
    stripe: { publishableKey: null, accountId: null },
    turnstile: { siteKey: null },
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
