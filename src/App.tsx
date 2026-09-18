import { Navigate, Route, Routes } from 'react-router-dom'
import { CustomerLayout } from './shared/CustomerLayout'
import HemPage from './features/hem/HemPage'
import MenyPage from './features/meny/MenyPage'

/**
 * Kundsajten: helt publik, ingen inloggning. Okända sökvägar skickas till
 * startsidan i stället för att visa 404 — samma mönster som admin-appen.
 */
function App() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<HemPage />} />
        <Route path="meny" element={<MenyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
