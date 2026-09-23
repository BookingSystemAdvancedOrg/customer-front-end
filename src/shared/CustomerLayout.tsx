import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import logo from '../assets/anar/logo.png'
import granatapple from '../assets/anar/granatapple.webp'
import kebab from '../assets/anar/kebab.gif'
import historiaBg from '../assets/anar/historia-bg.png'
import parkingBg from '../assets/anar/parking.jpg'
import contactBg from '../assets/anar/contact.png'
import { OpeningHoursModal } from './OpeningHoursModal'
import { useLocationInfo } from './useLocationInfo'
import { RESTAURANT } from './restaurant'
import './customer.css'

/**
 * Kundsajtens skal, design portad från github.com/AryaEisa/anar (den
 * riktiga ANAR Restaurang & Bar): header med vänster/höger-nav kring en
 * centrerad logotyp, hamburgermeny under 1074px, öppettider som modal, en
 * sidfast bakgrundsbild + gradient-scrim per sida (samma mönster som anars
 * SiteLayout.jsx), och en mörk footer. Ingen inloggning finns - sajten är
 * publik och skrivskyddad.
 *
 * Varukorgen visas INTE här — den hör bara hemma på Beställ mat (se
 * FloatingCart.tsx i src/features/bestall), eftersom det bara är där man
 * kan lägga något i den.
 */

const LEFT_NAV = [
  { to: '/meny', label: 'Meny' },
  { to: '/bestall', label: 'Beställ mat' },
  { to: '/boka-bord', label: 'Boka bord' },
]
const RIGHT_NAV = [
  { to: '/historia', label: 'Vår historia' },
  { to: '/parkering', label: 'Parkering' },
  { to: '/kontakt', label: 'Kontakt' },
]

/**
 * Sidfast bakgrundsfoto + scrim per sida. `data-page` styr scrim-varianten
 * i customer.css (samma princip som anars landing--meny/landing--historia
 * m.fl.). Sidor utan eget foto i anar-repot (Beställ mat, Boka bord - nya
 * sidor som inte finns i originalet) återanvänder startsidans kebab.gif.
 */
const PAGE_BACKGROUNDS: Record<string, { image: string; page: string }> = {
  '/': { image: granatapple, page: 'meny' },
  '/meny': { image: granatapple, page: 'meny' },
  '/bestall': { image: kebab, page: 'bestall' },
  '/boka-bord': { image: kebab, page: 'boka-bord' },
  '/historia': { image: historiaBg, page: 'historia' },
  '/parkering': { image: parkingBg, page: 'parkering' },
  '/kontakt': { image: contactBg, page: 'kontakt' },
}
const DEFAULT_BACKGROUND = { image: kebab, page: 'default' }

export function CustomerLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const location = useLocationInfo()
  const { pathname } = useLocation()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const prevMenuOpen = useRef(false)
  const headerRef = useRef<HTMLElement>(null)

  const background = PAGE_BACKGROUNDS[pathname] ?? DEFAULT_BACKGROUND

  const closeMenu = () => setMenuOpen(false)

  // Headern är sticky men dess höjd är flytande (clamp() i CSS) - mäter den
  // på riktigt i stället för att gissa ett pixelvärde, så att t.ex.
  // kategori-sidopanelen på Meny/Beställ mat kan klistra sig direkt under
  // den (`top: var(--header-h)`) på alla skärmbredder.
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const setVar = () => {
      document.documentElement.style.setProperty(
        '--header-h',
        `${header.getBoundingClientRect().height}px`,
      )
    }
    setVar()
    const ro = new ResizeObserver(setVar)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  useEffect(() => {
    if (prevMenuOpen.current && !menuOpen) {
      menuBtnRef.current?.focus()
    }
    prevMenuOpen.current = menuOpen
  }, [menuOpen])

  return (
    <div className="landing" data-page={background.page}>
      <img className="landing-bg" key={background.image} src={background.image} alt="" aria-hidden="true" />
      <div className="landing-scrim" aria-hidden="true" />

      <div className="site landing-content">
        <header className="site-header" ref={headerRef}>
          <div className="site-header-gutter" aria-hidden="true" />

          <nav className="site-header-nav site-header-nav--left" aria-label="Huvudmeny vänster">
            <ul>
              {LEFT_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to}>{item.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <Link className="site-header-brand" to="/" aria-label="Anar - startsida">
            <img src={logo} alt="" width={72} height={72} />
          </Link>

          <nav className="site-header-nav site-header-nav--right" aria-label="Huvudmeny höger">
            <ul>
              {RIGHT_NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to}>{item.label}</NavLink>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="site-header-dropdown-trigger"
                  aria-expanded={hoursOpen}
                  aria-haspopup="dialog"
                  onClick={() => setHoursOpen(true)}
                >
                  Öppettider
                </button>
              </li>
            </ul>
          </nav>

          <button
            ref={menuBtnRef}
            type="button"
            className={`site-header-burger${menuOpen ? ' site-header-burger--open' : ''}`}
            aria-label={menuOpen ? 'Stäng meny' : 'Öppna meny'}
            aria-expanded={menuOpen}
            aria-controls="mobile-drawer"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="site-header-burger-line" aria-hidden="true" />
            <span className="site-header-burger-line" aria-hidden="true" />
            <span className="site-header-burger-line" aria-hidden="true" />
          </button>
        </header>

        <div
          className={`mobile-drawer-backdrop${menuOpen ? ' mobile-drawer-backdrop--visible' : ''}`}
          aria-hidden="true"
          onClick={closeMenu}
        />

        <aside
          id="mobile-drawer"
          className={`mobile-drawer${menuOpen ? ' mobile-drawer--open' : ''}`}
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Mobilmeny">
            <ul className="mobile-drawer-list">
              {[...LEFT_NAV, ...RIGHT_NAV].map((item) => (
                <li key={item.to}>
                  <Link to={item.to} onClick={closeMenu}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="mobile-drawer-hours-trigger"
                  onClick={() => {
                    closeMenu()
                    setHoursOpen(true)
                  }}
                >
                  Öppettider
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <OpeningHoursModal open={hoursOpen} onClose={() => setHoursOpen(false)} />

        <main className="site-main">
          <Outlet />
        </main>

        <footer className="site-footer">
          <div className="footer-cols">
            <div className="footer-brand">
              <h2>{location.name}</h2>
              <p>{RESTAURANT.tagline}</p>
            </div>
            <div>
              <h3>Öppettider</h3>
              <ul className="footer-hours">
                {location.openingHours.map((row) => (
                  <li key={row.days}>
                    {row.days}: {row.hours}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Adress &amp; kontakt</h3>
              <p>{location.address}</p>
              <p>{location.phone}</p>
              <p>{location.email}</p>
            </div>
          </div>
          <div className="site-footer-main">
            <p className="site-footer-rights">
              © {new Date().getFullYear()} ANAR AB. Alla rättigheter förbehållna.
            </p>
            <div className="site-footer-credit-block">
              <p className="site-footer-credit">Denna hemsida är fullt utvecklad av IT Hjälparna Nordic AB</p>
              <p className="site-footer-dev-site">
                <a
                  className="site-footer-dev-link"
                  href="https://www.ithjalparna.se"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  www.ithjalparna.se
                </a>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
