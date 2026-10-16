import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { OpeningHoursModal } from './OpeningHoursModal'
import { useLocationInfo } from './useLocationInfo'
import { useSite } from './SiteContext'
import './customer.css'

/**
 * Kundsajtens skal: header med vänster/höger-nav kring restaurangens
 * logotyp (eller namn), hamburgermeny under 1074px, öppettider som modal,
 * restaurangens egen bakgrundsbild (varumärkesinställningen heroImageUrl,
 * annars en neutral gradient) och en mörk footer med juridiska länkar.
 *
 * Allt innehåll kommer från GET /site-config för den här domänen - ingen
 * restaurangs uppgifter är inbyggda i sajten. Menypunkter visas bara för
 * funktioner restaurangen har i sin plan.
 */

interface NavItem {
  to: string
  label: string
}

export function CustomerLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const location = useLocationInfo()
  const { config, location: current, setLocationId } = useSite()
  const { tenant, legal } = config
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const prevMenuOpen = useRef(false)
  const headerRef = useRef<HTMLElement>(null)

  const LEFT_NAV: NavItem[] = [
    { to: '/meny', label: 'Meny' },
    ...(tenant.features.reservations ? [{ to: '/boka-bord', label: 'Boka bord' }] : []),
    ...(tenant.features.ordering && current.ordering?.pickup ? [{ to: '/bestall', label: 'Beställ' }] : []),
    ...(tenant.features.catering && current.catering ? [{ to: '/catering', label: 'Catering' }] : []),
  ]
  const RIGHT_NAV: NavItem[] = [
    ...(tenant.branding.about ? [{ to: '/om-oss', label: 'Om oss' }] : []),
    { to: '/kontakt', label: 'Kontakt' },
  ]

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
    <div className="landing" data-page="default">
      {tenant.branding.heroImageUrl ? (
        <img className="landing-bg" src={tenant.branding.heroImageUrl} alt="" aria-hidden="true" />
      ) : (
        <div className="landing-bg landing-bg--plain" aria-hidden="true" />
      )}
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

          <Link className="site-header-brand" to="/" aria-label={`${tenant.name} - startsida`}>
            {tenant.branding.logoUrl ? (
              <img src={tenant.branding.logoUrl} alt="" width={72} height={72} />
            ) : (
              <span className="site-header-wordmark">{tenant.name}</span>
            )}
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

        {config.locations.length > 1 && (
          <div className="location-picker">
            <label htmlFor="site-location">Restaurang</label>
            <select
              id="site-location"
              value={current.locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {config.locations.map((l) => (
                <option key={l.locationId} value={l.locationId}>
                  {l.name || tenant.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <main className="site-main">
          <Outlet key={current.locationId} />
        </main>

        <footer className="site-footer">
          <div className="footer-cols">
            <div className="footer-brand">
              <h2>{location.name}</h2>
              {tenant.branding.tagline && <p>{tenant.branding.tagline}</p>}
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
              {location.address && <p>{location.address}</p>}
              {location.phone && <p><a href={`tel:${location.phone.replace(/[^\d+]/g, '')}`}>{location.phone}</a></p>}
              {location.email && <p><a href={`mailto:${location.email}`}>{location.email}</a></p>}
            </div>
          </div>
          <div className="site-footer-main">
            <p className="site-footer-rights">
              © {new Date().getFullYear()} {legal.legalName}
              {legal.orgNumber ? ` · org.nr ${legal.orgNumber}` : ''}
            </p>
            <nav className="site-footer-legal" aria-label="Juridiskt">
              <Link to="/integritetspolicy">Integritetspolicy</Link>
              {tenant.features.reservations && <Link to="/bokningsvillkor">Bokningsvillkor</Link>}
            </nav>
          </div>
        </footer>
      </div>
    </div>
  )
}
