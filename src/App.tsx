import { Navigate, Route, Routes } from 'react-router-dom'
import {
  BookingFlow,
  BookingTermsPage,
  CateringFlow,
  CateringRequest,
  CookiePolicy,
  ManageBooking,
  OrderFlow,
  OrderStatus,
  PrivacyPolicy,
  useSite,
} from '@booqy/site-kit'
import { CustomerLayout } from './shared/CustomerLayout'
import MenyPage from './features/meny/MenyPage'
import KontaktPage from './features/kontakt/KontaktPage'
import OmOssPage from './features/om/OmOssPage'

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
 */
function App() {
  const { config } = useSite()
  const reservations = config.tenant.features.reservations
  const ordering = config.tenant.features.ordering
  const catering = config.tenant.features.catering
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<MenyPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
