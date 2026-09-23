import { Navigate, Route, Routes } from 'react-router-dom'
import { CustomerLayout } from './shared/CustomerLayout'
import MenyPage from './features/meny/MenyPage'
import BestallMatPage from './features/bestall/BestallMatPage'
import BokaBordPage from './features/boka/BokaBordPage'
import HistoriaPage from './features/historia/HistoriaPage'
import ParkeringPage from './features/parkering/ParkeringPage'
import KontaktPage from './features/kontakt/KontaktPage'

/**
 * Kundsajten: helt publik, ingen inloggning. Menyn är startsida; okända
 * sökvägar skickas dit i stället för att visa 404.
 *
 * Designen är portad från github.com/AryaEisa/anar (den riktiga ANAR
 * Restaurang & Bar) i stället för den tidigare KÄLLA-Figma-placeholdern.
 * Nav: Meny · Beställ mat · Boka bord · Vår historia · Parkering · Kontakt.
 * Kolgrill/Drinkmeny/Dagens lunch portades INTE: det innehållet är rikt,
 * handskrivet redaktionellt material (helgrätter, priser i rubriktext,
 * flera språk) som inte går att uttrycka i backendens enkla fyra-kategoris
 * meny-API - Meny-sidan visar i stället den riktiga, publika
 * GET /locations/{id}/menu. Beställ mat är samma menydata plus varukorgen
 * (Meny i sig är enbart läsning, se MenyPage.tsx/BestallMatPage.tsx).
 *
 * Boka bord visar TILLS VIDARE bara den riktiga planritningen
 * (GET /locations/{id}/layout/active) - inget datum-/bordsval och ingen
 * bekräftelse, eftersom det ännu inte finns en godkänd
 * reservations-integration i backend. Den fulla bokningsflödet byggs på
 * nytt mot /reservations när den är godkänd (se BokaBordPage.tsx).
 */
function App() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<MenyPage />} />
        <Route path="meny" element={<MenyPage />} />
        <Route path="bestall" element={<BestallMatPage />} />
        <Route path="boka-bord" element={<BokaBordPage />} />
        <Route path="historia" element={<HistoriaPage />} />
        <Route path="parkering" element={<ParkeringPage />} />
        <Route path="kontakt" element={<KontaktPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
