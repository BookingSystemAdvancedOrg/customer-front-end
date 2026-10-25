import { Navigate, Route, Routes } from 'react-router-dom'
import { CustomerLayout } from './shared/CustomerLayout'
import { useSite } from './shared/SiteContext'
import MenyPage from './features/meny/MenyPage'
import BokaBordPage from './features/boka/BokaBordPage'
import ManageBookingPage from './features/bokning/ManageBookingPage'
import BestallPage from './features/bestall/BestallPage'
import OrderStatusPage from './features/bestall/OrderStatusPage'
import CateringPage from './features/catering/CateringPage'
import CateringRequestPage from './features/catering/CateringRequestPage'
import KontaktPage from './features/kontakt/KontaktPage'
import OmOssPage from './features/om/OmOssPage'
import PrivacyPage from './features/juridik/PrivacyPage'
import TermsPage from './features/juridik/TermsPage'
import CookiesPage from './features/juridik/CookiesPage'

/**
 * Restaurangens publika webbplats - samma sajt för alla restauranger, med
 * innehållet från GET /site-config (se shared/site.ts). Menyn är startsida;
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
        {reservations && <Route path="boka-bord" element={<BokaBordPage />} />}
        {reservations && <Route path="bokningsvillkor" element={<TermsPage />} />}
        <Route path="bokning/:locationId/:reservationId" element={<ManageBookingPage />} />
        {ordering && <Route path="bestall" element={<BestallPage />} />}
        <Route path="bestallning/:locationId/:orderId" element={<OrderStatusPage />} />
        {catering && <Route path="catering" element={<CateringPage />} />}
        <Route path="catering/:locationId/:requestId" element={<CateringRequestPage />} />
        <Route path="om-oss" element={<OmOssPage />} />
        <Route path="kontakt" element={<KontaktPage />} />
        <Route path="integritetspolicy" element={<PrivacyPage />} />
        <Route path="cookies" element={<CookiesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
