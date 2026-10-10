import { Navigate, Route, Routes } from 'react-router-dom'
import { CustomerLayout } from './shared/CustomerLayout'
import { useSite } from './shared/SiteContext'
import MenyPage from './features/meny/MenyPage'
import BokaBordPage from './features/boka/BokaBordPage'
import ManageBookingPage from './features/bokning/ManageBookingPage'
import KontaktPage from './features/kontakt/KontaktPage'
import OmOssPage from './features/om/OmOssPage'
import PrivacyPage from './features/juridik/PrivacyPage'
import TermsPage from './features/juridik/TermsPage'

/**
 * Restaurangens publika webbplats - samma sajt för alla restauranger, med
 * innehållet från GET /site-config (se shared/site.ts). Menyn är startsida;
 * okända sökvägar skickas dit. Boka bord och dess sidor finns bara när
 * restaurangen har bokning i sin plan.
 */
function App() {
  const { config } = useSite()
  const reservations = config.tenant.features.reservations
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<MenyPage />} />
        <Route path="meny" element={<MenyPage />} />
        {reservations && <Route path="boka-bord" element={<BokaBordPage />} />}
        {reservations && <Route path="bokningsvillkor" element={<TermsPage />} />}
        <Route path="bokning/:locationId/:reservationId" element={<ManageBookingPage />} />
        <Route path="om-oss" element={<OmOssPage />} />
        <Route path="kontakt" element={<KontaktPage />} />
        <Route path="integritetspolicy" element={<PrivacyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
