import { lazy } from 'react'
import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { sitePages, useSite } from '@booqy/site-kit'
import { CustomerLayout } from './shared/CustomerLayout'
import MenyPage from './features/meny/MenyPage'
import KontaktPage from './features/kontakt/KontaktPage'
import OmOssPage from './features/om/OmOssPage'
import NotFoundPage from './features/notfound/NotFoundPage'

// Flödena hämtas först när gästen öppnar dem (menyn, startsidan, är med från
// början); CustomerLayout visar laddningen under tiden.
const BookingFlow = lazy(sitePages.booking)
const ManageBooking = lazy(sitePages.manageBooking)
const OrderFlow = lazy(sitePages.order)
const OrderStatus = lazy(sitePages.orderStatus)
const TableBill = lazy(sitePages.bill)
const CateringFlow = lazy(sitePages.catering)
const CateringRequest = lazy(sitePages.cateringRequest)
const PrivacyPolicy = lazy(sitePages.privacy)
const CookiePolicy = lazy(sitePages.cookies)
const BookingTermsPage = lazy(sitePages.bookingTerms)
const GiftCards = lazy(sitePages.presentkort)
const GiftCardBalance = lazy(sitePages.presentkortSaldo)
const Queue = lazy(sitePages.ko)
const Events = lazy(sitePages.evenemang)
const EventDetail = lazy(sitePages.evenemangDetalj)
const Tickets = lazy(sitePages.biljett)
const TicketReceive = lazy(sitePages.biljettTaEmot)

/**
 * Restaurangens publika webbplats - samma sajt för alla restauranger, med
 * innehållet från GET /site-config. Flödena (boka, beställ, catering,
 * juridik) kommer från @booqy/site-kit; den här appen är layouten, sidorna
 * och looken. Menyn är startsida;
 * okända sökvägar skickas dit. Boka bord och dess sidor finns bara när
 * restaurangen har bokning i sin plan; Beställ (avhämtning och QR-koden på
 * bordet) bara med beställning i planen. Gästens sidor för en gjord
 * bokning/beställning (länkar i sms och mejl) och notan vid bordet
 * (personalens QR-kod för notan) finns alltid. Catering
 * (kalkyl -> offertförfrågan) med catering i planen; gästens sida för en
 * förfrågan (offert, BankID-signering, betalning) finns alltid.
 * Presentkort, kö (när platsen tar emot kö på sajten) och evenemang (med
 * biljettsidorna) finns bara med funktionen i planen.
 */
function App() {
  const { config, location } = useSite()
  const reservations = config.tenant.features.reservations
  const ordering = config.tenant.features.ordering
  const catering = config.tenant.features.catering
  const giftCards = config.tenant.features.giftCards
  const queue = config.tenant.features.waitlist && location.waitlist?.publicJoin
  const events = config.tenant.features.events
  // Fliken och sökträffen säger vilken sida det är ("Boka bord - Bistro X");
  // React 19 lyfter <title> till <head>.
  const name = config.tenant.name
  const t = (label: string, el: ReactNode) => (
    <>
      <title>{`${label} - ${name}`}</title>
      {el}
    </>
  )
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<><title>{name}</title><MenyPage /></>} />
        <Route path="meny" element={t('Meny', <MenyPage />)} />
        {reservations && <Route path="boka-bord" element={t('Boka bord', <BookingFlow />)} />}
        {reservations && <Route path="bokningsvillkor" element={t('Bokningsvillkor', <BookingTermsPage />)} />}
        <Route path="bokning/:locationId/:reservationId" element={t('Din bokning', <ManageBooking />)} />
        {ordering && <Route path="bestall" element={t('Beställ', <OrderFlow />)} />}
        <Route path="bestallning/:locationId/:orderId" element={t('Din beställning', <OrderStatus />)} />
        <Route path="notan/:locationId" element={t('Notan', <TableBill />)} />
        <Route path="notan/:locationId/:orderId" element={t('Notan', <TableBill />)} />
        {catering && <Route path="catering" element={t('Catering', <CateringFlow />)} />}
        <Route path="catering/:locationId/:requestId" element={t('Din cateringförfrågan', <CateringRequest />)} />
        <Route path="om-oss" element={t('Om oss', <OmOssPage />)} />
        <Route path="kontakt" element={t('Kontakt', <KontaktPage />)} />
        <Route path="integritetspolicy" element={t('Integritetspolicy', <PrivacyPolicy />)} />
        <Route path="cookies" element={t('Cookies', <CookiePolicy />)} />
        {giftCards && <Route path="presentkort" element={t('Presentkort', <GiftCards />)} />}
        {giftCards && <Route path="presentkort/saldo" element={t('Saldo på presentkort', <GiftCardBalance />)} />}
        {queue && <Route path="ko" element={t('Kö', <Queue />)} />}
        {events && <Route path="evenemang" element={t('Evenemang', <Events />)} />}
        {events && <Route path="evenemang/:eventId" element={t('Evenemang', <EventDetail />)} />}
        {events && <Route path="biljett" element={t('Dina biljetter', <Tickets />)} />}
        {events && <Route path="biljett/ta-emot" element={t('Ta emot biljett', <TicketReceive />)} />}
        <Route path="*" element={t('Sidan finns inte', <NotFoundPage reservations={!!reservations} events={!!events} />)} />
      </Route>
    </Routes>
  )
}

export default App
