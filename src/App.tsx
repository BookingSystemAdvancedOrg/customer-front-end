import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { sitePages, useSite } from '@booqy/site-kit'
import { CustomerLayout } from './shared/CustomerLayout'
import MenyPage from './features/meny/MenyPage'
import KontaktPage from './features/kontakt/KontaktPage'
import OmOssPage from './features/om/OmOssPage'

// Flödena hämtas först när gästen öppnar dem (menyn, startsidan, är med från
// början); CustomerLayout visar laddningen under tiden.
const BookingFlow = lazy(sitePages.booking)
const ManageBooking = lazy(sitePages.manageBooking)
const OrderFlow = lazy(sitePages.order)
const OrderStatus = lazy(sitePages.orderStatus)
const CateringFlow = lazy(sitePages.catering)
const CateringRequest = lazy(sitePages.cateringRequest)
const PrivacyPolicy = lazy(sitePages.privacy)
const CookiePolicy = lazy(sitePages.cookies)
const BookingTermsPage = lazy(sitePages.bookingTerms)
const GiftCards = lazy(sitePages.presentkort)
const GiftCardBalance = lazy(sitePages.presentkortSaldo)
const Queue = lazy(sitePages.ko)
const SitePreview = lazy(sitePages.forhandsvisning)
const BuilderPage = lazy(sitePages.builderPage)
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
 * bokning/beställning (länkar i sms och mejl) finns alltid. Catering
 * (kalkyl -> offertförfrågan) med catering i planen; gästens sida för en
 * förfrågan (offert, BankID-signering, betalning) finns alltid.
 * Presentkort, kö (när platsen tar emot kö på sajten), förhandsvisning och
 * evenemang (med biljettsidorna) finns bara med funktionen i planen. En sajt från webbplatsbyggaren med en
 * publicerad version ritar startsidan och okända sökvägar som byggarens sidor; /meny är kvar.
 */
function App() {
  const { config, location } = useSite()
  const reservations = config.tenant.features.reservations
  const ordering = config.tenant.features.ordering
  const catering = config.tenant.features.catering
  const giftCards = config.tenant.features.giftCards
  const queue = config.tenant.features.waitlist && location.waitlist?.publicJoin
  const siteBuilder = config.tenant.features.siteBuilder
  const events = config.tenant.features.events
  const builder = siteBuilder && config.tenant.site?.mode === 'builder' && config.tenant.site.version > 0
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={builder ? <BuilderPage /> : <MenyPage />} />
        <Route path="meny" element={<MenyPage />} />
        {reservations && <Route path="boka-bord" element={<BookingFlow />} />}
        {reservations && <Route path="bokningsvillkor" element={<BookingTermsPage />} />}
        <Route path="bokning/:locationId/:reservationId" element={<ManageBooking />} />
        {ordering && <Route path="bestall" element={<OrderFlow />} />}
        <Route path="bestallning/:locationId/:orderId" element={<OrderStatus />} />
        {catering && <Route path="catering" element={<CateringFlow />} />}
        <Route path="catering/:locationId/:requestId" element={<CateringRequest />} />
        <Route path="om-oss" element={<OmOssPage />} />
        <Route path="kontakt" element={<KontaktPage />} />
        <Route path="integritetspolicy" element={<PrivacyPolicy />} />
        <Route path="cookies" element={<CookiePolicy />} />
        {giftCards && <Route path="presentkort" element={<GiftCards />} />}
        {giftCards && <Route path="presentkort/saldo" element={<GiftCardBalance />} />}
        {queue && <Route path="ko" element={<Queue />} />}
        {siteBuilder && <Route path="forhandsvisning" element={<SitePreview />} />}
        {events && <Route path="evenemang" element={<Events />} />}
        {events && <Route path="evenemang/:eventId" element={<EventDetail />} />}
        {events && <Route path="biljett" element={<Tickets />} />}
        {events && <Route path="biljett/ta-emot" element={<TicketReceive />} />}
        <Route path="*" element={builder ? <BuilderPage /> : <Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
