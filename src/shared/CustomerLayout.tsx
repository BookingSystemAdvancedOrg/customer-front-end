import { NavLink, Outlet } from 'react-router-dom'
import { RESTAURANT } from './restaurant'
import './customer.css'

/**
 * Kundsajtens skal: topbar med namn och navigering, sidinnehåll i
 * <Outlet />, och footer med kontaktuppgifter. Ingen inloggning finns —
 * sajten är publik och skrivskyddad.
 */
export function CustomerLayout() {
  return (
    <div className="site">
      <header className="site-topbar">
        <NavLink to="/" className="site-logo">
          {RESTAURANT.name}
        </NavLink>
        <nav className="site-nav" aria-label="Huvudmeny">
          <NavLink to="/" end>
            Hem
          </NavLink>
          <NavLink to="/meny">Meny</NavLink>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>{RESTAURANT.name}</span>
        <span>{RESTAURANT.address}</span>
        <span>{RESTAURANT.phone}</span>
      </footer>
    </div>
  )
}
