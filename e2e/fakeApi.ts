import type { Page, Route } from '@playwright/test'

/**
 * Ett påhittat Booqy-API för e2e: /site-config och evenemangsrutterna
 * K15-K22 med svaren i application docs/openapi/events-tickets.yaml, plus en
 * attrapp av Stripe.js (js.stripe.com) som "betalar" direkt. Inga riktiga
 * nycklar, inget nätverk.
 */
export const API = 'https://api.e2e.test'
export const LOCATION_ID = 'loc-1'
export const EVENT_ID = '01JEVENTVINPROVNING0000001'
export const OCC_1 = `${EVENT_ID}-2026-11-20T18:00:00Z`
export const OCC_2 = `${EVENT_ID}-2026-11-27T18:00:00Z`
export const TICKET_TOKEN = 'bzowMUpPUkRFUjAwMDAwMDAx.c2lnbmF0dXJlMDAwMDAw'
export const GIFT_TOKEN = 'eDowMUpHSUZUMDAwMDAwMDAx.c2lnbmF0dXJlMDAwMDAx'

export function siteConfig(events = true) {
  return {
    tenant: {
      tenantId: 't-1', name: 'Testkrogen', slug: 'testkrogen', branding: { tagline: 'God mat i stan' },
      features: { reservations: true, ordering: false, catering: false, terminal: false, events },
    },
    legal: {
      legalName: 'Testkrogen AB', orgNumber: '556677-8899', contactEmail: 'info@testkrogen.se',
      contactPhone: '+46812345678', address: 'Gatan 1, Stockholm',
    },
    locations: [{
      locationId: LOCATION_ID, name: 'Testkrogen City', address: 'Gatan 1, Stockholm', phoneNumber: '08-123 456 78',
      email: 'city@testkrogen.se', timezone: 'Europe/Stockholm',
      businessHours: { monday: [{ opensAt: '11:00', closesAt: '22:00' }] }, bookingDurationHours: 2, maxPartySizeOnline: 8,
    }],
    stripe: { publishableKey: 'pk_test_e2e', accountId: 'acct_e2e' },
    turnstile: { siteKey: null },
  }
}

export const EVENT = {
  eventId: EVENT_ID,
  title: 'Vinprovning: Rhônedalen',
  description: 'Sommelier Lina Berg guidar genom fem viner från norra och södra Rhône, med ost och chark till.',
  refundPolicy: 'Full återbetalning fram till sju dagar före. Därefter kan du ge bort biljetten.',
  perOrderMax: 6,
  occurrences: [
    { occurrenceId: OCC_1, startAt: '2026-11-20T18:00:00Z', endAt: '2026-11-20T21:00:00Z', left: 4, soldOut: false, salesOpen: true },
    { occurrenceId: OCC_2, startAt: '2026-11-27T18:00:00Z', endAt: '2026-11-27T21:00:00Z', left: 0, soldOut: true, salesOpen: true },
  ],
  ticketTypes: [
    { typeId: 'VUXEN000001', name: 'Vinprovning', priceSek: 450, priceOre: 45000, perOrderMax: 6, includes: 'Fem glas, ost och chark', available: true },
    { typeId: 'TIDIG000001', name: 'Tidig fågel', priceSek: 350, priceOre: 35000, perOrderMax: 2, left: 0, available: false },
  ],
}

/** K16 med vidareförsäljning på: två biljetter från andra gäster till det slutsålda tillfället. */
export const RESALE_LISTINGS = [
  { transferId: 'rs00000000000000000000000000001', occurrenceId: OCC_2, typeId: 'VUXEN000001', typeName: 'Vinprovning', priceSek: 450, priceOre: 45000 },
  { transferId: 'rs00000000000000000000000000002', occurrenceId: OCC_2, typeId: 'TIDIG000001', typeName: 'Tidig fågel', priceSek: 350, priceOre: 35000 },
]
export const EVENT_WITH_RESALE = { ...EVENT, resaleAllowed: true, resale: RESALE_LISTINGS }

export const EVENTS = {
  events: [
    { eventId: EVENT_ID, title: EVENT.title, nextOccurrence: '2026-11-20T18:00:00Z', fromPriceSek: 350, soldOut: false },
    { eventId: '01JEVENTQUIZ00000000000001', title: 'Quiz med Kalle', nextOccurrence: '2026-11-25T18:30:00Z', fromPriceSek: 0, soldOut: false },
    { eventId: '01JEVENTNYAR000000000000001', title: 'Nyårsmiddag', nextOccurrence: '2026-12-31T18:00:00Z', fromPriceSek: 1495, soldOut: true },
  ],
}

export type Pending = false | 'gift' | 'resale'

export function ticketPage(pending: Pending = false, resale = false) {
  const first = { ticketId: '01JTICKET0000000000000001', typeId: 'VUXEN000001', typeName: 'Vinprovning', holderName: 'Sara Ek', status: 'valid',
    qr: '01JTICKET0000000000000001.9f2c4e1a7b3d5c60', priceOre: 45000 }
  const pendingFields = pending === 'gift'
    ? { pendingTransferId: 'tr0000000000000000000000000000001', pendingTransfer: { transferId: 'tr0000000000000000000000000000001', kind: 'gift', status: 'pending', priceOre: 0 } }
    : pending === 'resale'
      ? { pendingTransferId: 'tr0000000000000000000000000000001', resale: 'listed', pendingTransfer: { transferId: 'tr0000000000000000000000000000001', kind: 'resale', status: 'pending', priceOre: 45000 } }
      : {}
  return {
    event: { eventId: EVENT_ID, title: EVENT.title, description: EVENT.description, refundPolicy: EVENT.refundPolicy },
    occurrence: { occurrenceId: OCC_1, startAt: '2026-11-20T18:00:00Z', endAt: '2026-11-20T21:00:00Z', doorsAt: '2026-11-20T17:30:00Z', status: 'scheduled' },
    location: { locationId: LOCATION_ID, name: 'Testkrogen City' },
    tickets: [
      { ...first, ...pendingFields },
      { ticketId: '01JTICKET0000000000000002', typeId: 'VUXEN000001', typeName: 'Vinprovning', holderName: 'Sara Ek', status: 'checked_in',
        checkedInAt: '2026-11-20T17:41:00Z', priceOre: 45000 },
      ...(resale ? [{ ticketId: '01JTICKET0000000000000003', typeId: 'VUXEN000001', typeName: 'Vinprovning', holderName: 'Sara Ek', status: 'void',
        resale: 'sold', priceOre: 45000 }] : []),
    ],
    wallet: { apple: false, google: false },
    transferAllowed: true,
    resaleAllowed: resale,
  }
}

/** Stripe.js-attrapp: Elements ritar ett stilla fält, confirmPayment lyckas. */
const FAKE_STRIPE = `
window.Stripe = function Stripe() {
  function element() {
    var handlers = {};
    return {
      mount: function (node) {
        var el = typeof node === 'string' ? document.querySelector(node) : node;
        el.innerHTML = '<div data-testid="fake-stripe" style="padding:14px 16px;border-radius:12px;border:1px solid currentColor;opacity:.75">Kortnummer 4242 4242 4242 4242 &middot; 12/34 &middot; 123 (testattrapp)</div>';
        setTimeout(function () { (handlers.ready || []).forEach(function (h) { h({}); }); }, 0);
      },
      on: function (ev, h) { (handlers[ev] = handlers[ev] || []).push(h); },
      off: function () {}, update: function () {}, destroy: function () {}, unmount: function () {}
    };
  }
  return {
    elements: function () { return { create: element, getElement: function () { return null; }, update: function () {}, submit: function () { return Promise.resolve({}); } }; },
    createToken: function () {}, createPaymentMethod: function () {}, confirmCardPayment: function () {},
    confirmPayment: function () { window.__paid = true; return Promise.resolve({ paymentIntent: { id: 'pi_e2e', status: 'succeeded' } }); }
  };
};
window.Stripe.version = 3;
`

export interface FakeState {
  checkouts: Record<string, unknown>[]
  transfers: Record<string, unknown>[]
  cancelled: string[]
  accepted: Record<string, unknown>[]
  eventCalls: number
  pending: Pending
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) })

/** `resale`: restaurangen tillåter vidareförsäljning (K16 har utlagda biljetter, K18 säger resaleAllowed). */
export async function fakeApi(page: Page, { events = true, free = false, resale = false } = {}): Promise<FakeState> {
  const state: FakeState = { checkouts: [], transfers: [], cancelled: [], accepted: [], eventCalls: 0, pending: false }
  await page.route('https://js.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_STRIPE }))
  await page.route('https://m.stripe.network/**', (route) => route.abort())
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': 'Content-Type,Accept' } })
    }
    const url = new URL(req.url())
    const path = url.pathname
    const notFound = () => json(route, { error: 'not found', code: 'not found' }, 404)
    if (path === '/site-config') return json(route, siteConfig(events))
    if (path.startsWith('/public/') && !events) return notFound()
    const loc = `/public/locations/${LOCATION_ID}/events`
    if (req.method() === 'GET' && path === loc) return json(route, EVENTS)
    if (req.method() === 'GET' && path === `${loc}/${EVENT_ID}`) {
      state.eventCalls += 1
      if (free) return json(route, { ...EVENT, ticketTypes: [{ typeId: 'FRI0000001', name: 'Fri entré', priceSek: 0, priceOre: 0, perOrderMax: 4, available: true }] })
      return json(route, resale ? EVENT_WITH_RESALE : EVENT)
    }
    if (req.method() === 'POST' && path === `${loc}/checkout`) {
      const body = req.postDataJSON() as Record<string, unknown>
      state.checkouts.push(body)
      if (free) return json(route, { amountSek: 0, expiresAt: '2026-11-05T15:15:00Z' })
      const picked = (body.resaleTransferIds as string[] | undefined) ?? []
      const amountSek = picked.length
        ? RESALE_LISTINGS.filter((r) => picked.includes(r.transferId)).reduce((s, r) => s + r.priceSek, 0)
        : (body.lines as { typeId: string; qty: number }[]).reduce((s, l) => s + l.qty * 450, 0)
      return json(route, { clientSecret: 'pi_e2e_secret_e2e', amountSek, expiresAt: '2026-11-05T15:15:00Z', stripeAccount: 'acct_e2e' })
    }
    if (path === `/public/tickets/${TICKET_TOKEN}` && req.method() === 'GET') return json(route, ticketPage(state.pending, resale))
    if (path === `/public/tickets/${TICKET_TOKEN}/transfers` && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      state.transfers.push(body)
      state.pending = body.kind === 'resale' ? 'resale' : 'gift'
      return json(route, { transferId: body.transferId, ticketId: body.ticketId, kind: body.kind, status: 'pending',
        priceOre: body.kind === 'resale' ? 45000 : 0 }, 201)
    }
    if (path.startsWith(`/public/tickets/${TICKET_TOKEN}/transfers/`) && req.method() === 'DELETE') {
      state.cancelled.push(path.split('/').pop() ?? '')
      state.pending = false
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' })
    }
    if (path === `/public/ticket-transfers/${GIFT_TOKEN}/accept` && req.method() === 'POST') {
      state.accepted.push(req.postDataJSON() as Record<string, unknown>)
      return json(route, { ticketToken: TICKET_TOKEN })
    }
    if (path.startsWith('/public/')) return notFound()
    return json(route, { items: [] })
  })
  return state
}
