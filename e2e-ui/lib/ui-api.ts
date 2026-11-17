import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { API, EVENT, EVENTS, LOCATION_ID, TICKET_TOKEN, fakeApi, siteConfig, ticketPage } from '../../e2e/fakeApi'

export { TICKET_TOKEN, EVENT }
const dish = readFileSync(resolve(import.meta.dirname, '../fixtures/dish.jpg'))

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) })

const menu = {
  categories: [{ categoryId: 'starters', name: 'Förrätter' }, { categoryId: 'mains', name: 'Varmrätter' }, { categoryId: 'desserts', name: 'Efterrätter' }, { categoryId: 'drinks', name: 'Drycker' }],
  items: [
    { menuItemId: 'm1', name: 'Toast Skagen med dill och citron och en alldeles för lång rubrik för att testa radbrytning', description: 'Handskalade räkor, löjrom och rostat surdegsbröd. Serveras med smör och en kvist dill.', price: 165, category: 'starters', imageKey: 'menu-images/a.jpg', allergens: ['gluten', 'crustaceans', 'milk'] },
    { menuItemId: 'm2', name: 'Råbiff', description: 'Med kapris, rödlök, äggula och pommes.', price: 215, category: 'mains', imageKey: null, allergens: ['eggs'] },
    { menuItemId: 'm3', name: 'Pizza Margherita', description: 'San Marzano, mozzarella, basilika.', price: 145, category: 'mains', imageKey: 'menu-images/a.jpg', options: [{ name: 'Storlek', required: true, maxChoices: 1, choices: [{ name: 'Liten', price: 0 }, { name: 'Stor', price: 30 }] }] },
    { menuItemId: 'm4', name: 'Crème brûlée', description: 'Klassisk, med vanilj.', price: 95, category: 'desserts', imageKey: null },
    { menuItemId: 'm5', name: 'Husets rödvin', description: 'Glas, 12 cl.', price: 110, category: 'drinks', imageKey: null, alcohol: true },
    { menuItemId: 'm6', name: 'Hembryggd ingefärsläsk', description: '33 cl.', price: 55, category: 'drinks', imageKey: null },
  ],
}
const hours = { opensAt: '11:00', closesAt: '22:00' }
const info = {
  locationId: LOCATION_ID, name: 'Testkrogen City', address: 'Gatan 1, 111 22 Stockholm', phoneNumber: '08-123 456 78', email: 'city@testkrogen.se', timezone: 'Europe/Stockholm',
  businessHours: { monday: [hours], tuesday: [hours], wednesday: [hours], thursday: [hours], friday: [{ opensAt: '11:00', closesAt: '23:00' }], saturday: [{ opensAt: '12:00', closesAt: '23:00' }], sunday: [] },
}
const slots = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'].map((t, i) => ({
  startTime: t, endTime: `${20 + (i % 3)}:00`, layoutVersion: 1, tables: [{ tableId: 'T1', seats: 4 }, { tableId: 'T2', seats: 6 }], options: [{ tableIds: ['T1'], seats: 4 }, { tableIds: ['T2'], seats: 6 }],
}))

const cateringSettings = {
  enabled: true, minPortions: 10, maxPortions: 300, advanceDays: 4, pickup: true, delivery: true, deliveryArea: 'Stockholm', maxDistanceKm: 25,
  priceWithinLimit: 395, priceBeyondLimit: 795, allowOutsideArea: false, cleaningFee: 300, terms: 'Villkor', offerValidDays: 7, paymentTermsDays: 30, minGuests: 10,
}
const cateringMenu = {
  packages: [{ packageId: 'p1', name: 'Buffé Roma', description: 'Lasagne, sallad och bröd.', pricePerGuest: 245, dishIds: ['d1', 'd2'], minGuests: 10 }],
  dishes: [
    { dishId: 'd1', name: 'Lasagne', description: 'Med bechamel och parmesan.', pricePerPortion: 125, allergens: ['gluten', 'milk'] },
    { dishId: 'd2', name: 'Grönsallad', description: 'Säsongens grönt.', pricePerPortion: 45, dietary: ['vegan'] },
  ],
}
const cateringQuote = {
  lines: [{ kind: 'package', packageId: 'p1', name: 'Buffé Roma', unitPrice: 24500, quantity: 20, vatRate: 12 }],
  guests: 20, portions: 20, tierName: null, subtotal: 490000, discountPercent: 0, discount: 0, deliveryFee: 0, cleaningFee: 0,
  total: 490000, vat: 52500, vatRate: 12, serviceIncluded: false, distanceKm: null, deliveryFeeManual: false, earliestDate: '2026-11-18',
}
/** Notan vid bordet: två obetalda beställningar vid bord 7 (pay later). */
export const TABLE_ORDER_ID = 'a'.repeat(32)
export const TABLE_BILL_ID = 'b'.repeat(32)
const billOrders = [
  { number: 12, createdAt: '2026-11-14T08:05:00Z', total: 37500, lines: [{ name: 'Råbiff', quantity: 1, total: 21500, vatRate: 12 }, { name: 'Pizza Margherita (Stor)', quantity: 1, total: 17500, vatRate: 12 }] },
  { number: 15, createdAt: '2026-11-14T08:40:00Z', total: 22000, lines: [{ name: 'Husets rödvin', quantity: 2, total: 22000, vatRate: 25 }] },
]
const billVat = [{ rate: 12, gross: 37500, net: 33482, vat: 4018 }, { rate: 25, gross: 22000, net: 17600, vat: 4400 }]
export const tableBill = { tableTitle: 'Bord 7', serviceDate: '2026-11-14', status: 'open', amount: 59500, count: 2, currency: 'sek', minChargeOre: 300, orders: billOrders, vat: billVat, location: { name: 'Testkrogen City' } }
const paidBill = { billId: TABLE_BILL_ID, status: 'paid', amount: 59500, count: 2, paidAt: '2026-11-14T09:00:00Z', tableTitle: 'Bord 7', serviceDate: '2026-11-14', orders: billOrders, vat: billVat }
const tableOrder = {
  orderId: TABLE_ORDER_ID, locationId: LOCATION_ID, number: 15, status: 'preparing', paymentStatus: 'unpaid', mode: 'table', tableLabel: '7', payLater: true, serviceDate: '2026-11-14',
  lines: [{ menuItemId: 'm5', name: 'Husets rödvin', unitPrice: 11000, quantity: 2, total: 22000, vatRate: 25 }], totalAmount: 22000, vat: [{ rate: 25, gross: 22000, net: 17600, vat: 4400 }],
  createdAt: '2026-11-14T08:40:00Z', confirmedAt: '2026-11-14T08:40:00Z', location: { name: 'Testkrogen City', address: 'Gatan 1, 111 22 Stockholm', phoneNumber: '08-123 456 78' },
  bill: { amount: 59500, count: 2, status: 'open' },
}

const giftOffer = { amountsSek: [300, 500, 1000], customMinSek: 100, customMaxSek: 5000, validityMonths: 24 }

/** All guest-site features on, with data on every page. Falls back to the e2e fakeApi for events and tickets. */
export async function uiApi(page: Page) {
  await fakeApi(page)
  await page.route('https://img.e2e.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: dish }))
  await page.route(`${API}/**`, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fallback()
    const u = new URL(req.url())
    const p = u.pathname
    if (p === '/site-config') {
      const c = siteConfig(true)
      return route.fulfill(json({ ...c, tenant: { ...c.tenant, features: { reservations: true, ordering: true, catering: true, giftCards: true, waitlist: true, events: true, terminal: false }, branding: { tagline: 'God mat i stan sedan 1998' } }, locations: [{ ...c.locations[0], ...info, waitlist: { publicJoin: true } }] }))
    }
    if (p === `/locations/${LOCATION_ID}/menu`) return route.fulfill(json(menu))
    if (p === `/locations/${LOCATION_ID}/public-info`) return route.fulfill(json(info))
    if (p === `/locations/${LOCATION_ID}/availability`) return route.fulfill(json({ locationId: LOCATION_ID, date: u.searchParams.get('date'), timezone: 'Europe/Stockholm', slots }))
    if (p === `/locations/${LOCATION_ID}/ordering`) return route.fulfill(json({ open: true, pickup: true, table: true, prepMinutes: 20, closesAt: '22:00', ...(u.searchParams.get('table') ? { forTable: { label: '7', title: 'Bord 7' } } : {}) }))
    if (p === `/locations/${LOCATION_ID}/order-status/${TABLE_ORDER_ID}`) return route.fulfill(json(tableOrder))
    if (p === `/locations/${LOCATION_ID}/table-bill`) return route.fulfill(json(tableBill))
    if (p === `/locations/${LOCATION_ID}/table-bill/${TABLE_BILL_ID}`) return route.fulfill(json(paidBill))
    if (p === `/locations/${LOCATION_ID}/layout/active`) return route.fulfill(json({ layout: null }, 404))
    if (p === `/locations/${LOCATION_ID}/catering/settings`) return route.fulfill(json(cateringSettings))
    if (p === `/locations/${LOCATION_ID}/catering/discount-tiers`) return route.fulfill(json({ tiers: [] }))
    if (p === `/locations/${LOCATION_ID}/catering/menu`) return route.fulfill(json(cateringMenu))
    if (p === `/locations/${LOCATION_ID}/catering/quote`) return route.fulfill(json(cateringQuote))
    if (p === `/public/locations/${LOCATION_ID}/gift-cards/offer`) return route.fulfill(json(giftOffer))
    if (p === `/public/locations/${LOCATION_ID}/events`) return route.fulfill(json(EVENTS))
    if (p === `/public/tickets/${TICKET_TOKEN}`) return route.fulfill(json(ticketPage(false, false)))
    return route.fallback()
  })
}
