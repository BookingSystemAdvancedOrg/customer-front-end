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

interface TestTable {
  tableId: string
  seats: number
}

interface TestSlot {
  startTime: string
  endTime: string
  layoutVersion: number
  tables: TestTable[]
  unavailable?: { tableId: string; reason: string; minParty?: number; maxParty?: number }[]
}

/**
 * GET /availability?partySize= som servern svarar (shared/booking_rules.py):
 * ett bord erbjuds sällskap från halva platserna (uppåt) till alla; en
 * kombination när alla dess bord är lediga och sällskapet ryms i dess spann.
 * Tider utan alternativ tas bort.
 */
export function guestView(
  body: { slots: TestSlot[]; day?: unknown; [key: string]: unknown },
  partySize: number,
  combos: { tableIds: string[]; minParty: number; maxParty: number }[] = [],
) {
  const slots = body.slots.flatMap((slot) => {
    const free = new Map(slot.tables.map((t) => [t.tableId, t.seats]))
    const options: { tableIds: string[]; seats: number }[] = []
    for (const t of slot.tables) {
      if (Math.max(1, Math.ceil(t.seats / 2)) <= partySize && partySize <= t.seats) {
        options.push({ tableIds: [t.tableId], seats: t.seats })
      }
    }
    for (const c of combos) {
      if (c.tableIds.every((id) => free.has(id))) {
        const seats = c.tableIds.reduce((sum, id) => sum + (free.get(id) ?? 0), 0)
        if (c.minParty <= partySize && partySize <= Math.min(c.maxParty, seats)) {
          options.push({ tableIds: [...c.tableIds].sort(), seats })
        }
      }
    }
    options.sort((a, b) => a.seats - b.seats || a.tableIds.length - b.tableIds.length)
    if (options.length === 0) return []
    const offered = new Set(options.flatMap((o) => o.tableIds))
    // Som backend: varför övriga bord inte går att välja. Bokade/spärrade
    // bord anges i testdatan (slot.unavailable); fria bord som inte passar
    // får sin storleksanledning.
    const unavailable = [
      ...(slot.unavailable ?? []),
      ...slot.tables
        .filter((t) => !offered.has(t.tableId))
        .map((t) => {
          const minParty = Math.max(1, Math.ceil(t.seats / 2))
          return { tableId: t.tableId, minParty, maxParty: t.seats, reason: partySize > t.seats ? 'too_small' : 'too_large' }
        }),
    ].sort((a, b) => a.tableId.localeCompare(b.tableId))
    return [{
      ...slot,
      tables: slot.tables.filter((t) => offered.has(t.tableId)),
      options,
      ...(unavailable.length ? { unavailable } : {}),
    }]
  })
  return { ...body, slots }
}

/** partySize ur en availability-URL. */
export function partyOf(url: string): number {
  return Number(new URL(url, 'https://api.test').searchParams.get('partySize'))
}
