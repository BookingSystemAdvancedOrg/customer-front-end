import { Navigate, Route, Routes } from 'react-router-dom'
import { CustomerLayout } from './shared/CustomerLayout'
import MenyPage from './features/meny/MenyPage'
import OmOssPage from './features/om-oss/OmOssPage'
import BokaBordPage from './features/boka/BokaBordPage'
import BetalningPage from './features/boka/BetalningPage'
import BekraftelsePage from './features/boka/BekraftelsePage'

/**
 * Kundsajten (Figma: KÄLLA): helt publik, ingen inloggning. Menyn är
 * startsida enligt designen; okända sökvägar skickas dit i stället för att
 * visa 404.
 */
function App() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<MenyPage />} />
        <Route path="meny" element={<MenyPage />} />
        <Route path="om-oss" element={<OmOssPage />} />
        <Route path="boka-bord" element={<BokaBordPage />} />
        <Route path="boka-bord/betalning" element={<BetalningPage />} />
        <Route path="boka-bord/bekraftelse" element={<BekraftelsePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
