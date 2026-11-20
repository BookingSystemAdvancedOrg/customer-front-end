import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LanguagePicker,
  OfferCard,
  OpeningHoursModal,
  PhoneLink,
  Select,
  SkelCard,
  SoundToggle,
  ThemeToggle,
  openStatus,
  trackPage,
  useLocationInfo,
  useSite,
} from '@booqy/site-kit'
import { BooqyWordmark } from './BooqyWordmark'

/**
 * Kundsajtens skal: ett band i restaurangens färg med namn/logga, menyn,
 * öppet-just-nu (öppnar öppettiderna), språkväljare och platsväljare; hamburgermeny på
 * mobil; footer med öppettider, kontakt och juridiska länkar.
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
    ...(tenant.features.giftCards ? [{ to: '/presentkort', label: 'Presentkort' }] : []),
    ...(tenant.features.events ? [{ to: '/evenemang', label: 'Evenemang' }] : []),
  ]
  const RIGHT_NAV: NavItem[] = [
    ...(tenant.branding.about ? [{ to: '/om-oss', label: 'Om oss' }] : []),
    { to: '/kontakt', label: 'Kontakt' },
  ]

  const closeMenu = () => setMenuOpen(false)

  // Besöksstatistik utan cookies (shared/visits.ts), bara med
  // marknadsföring i planen.
  const { pathname } = useLocation()
  const marketing = tenant.features.marketing
  useEffect(() => {
    if (marketing) trackPage(current.locationId, pathname)
  }, [marketing, current.locationId, pathname])

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
    // lock the root, not body: overflow on body makes body the scroller and the sticky header scrolls away
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      root.style.overflow = prev
    }
  }, [menuOpen])

  useEffect(() => {
    if (prevMenuOpen.current && !menuOpen) {
      menuBtnRef.current?.focus()
    }
    prevMenuOpen.current = menuOpen
  }, [menuOpen])

  const status = openStatus(
    current.businessHours ?? {},
    current.specialDays ?? [],
    current.timezone ?? 'Europe/Stockholm',
  )
  const NAV = [...LEFT_NAV, ...RIGHT_NAV]

  return (
    <div className="site">
      <header className="site-header" ref={headerRef}>
        <div className="site-header-inner">
          <Link className="site-header-brand" to="/" aria-label={`${tenant.name} - startsida`} onClick={closeMenu}>
            {tenant.branding.logoUrl ? (
              <img src={tenant.branding.logoUrl} alt="" width={44} height={44} />
            ) : null}
            <span className="site-header-wordmark" translate="no">{tenant.name}</span>
          </Link>

          <nav className="site-header-nav" aria-label="Huvudmeny">
            <ul>
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to}>{item.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <button
            type="button"
            className={`open-chip${status.open ? ' is-open' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={hoursOpen}
            onClick={() => setHoursOpen(true)}
          >
            <span className="open-chip-dot" aria-hidden="true" />
            <span>{status.text}</span>
            <span className="sr-only"> - visa öppettider</span>
          </button>

          <LanguagePicker className="site-header-lang" />

          <ThemeToggle className="site-header-theme" />

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
        </div>

        {config.locations.length > 1 && (
          <div className="location-picker">
            <label htmlFor="site-location">Restaurang</label>
            <Select
              id="site-location"
              value={current.locationId}
              onChange={setLocationId}
              options={config.locations.map((l) => ({ value: l.locationId, label: l.name || tenant.name }))}
            />
          </div>
        )}
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
            {NAV.map((item) => (
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
        <div className="page" key={`${current.locationId}:${pathname}`}>
          <Suspense fallback={<SkelCard label="Hämtar sidan" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {marketing && <OfferCard key={current.locationId} />}

      <footer className="site-footer">
        <div className="footer-cols">
          <div className="footer-brand">
            <h2 translate="no">{location.name}</h2>
            {tenant.branding.tagline && <p>{tenant.branding.tagline}</p>}
          </div>
          <div>
            <h3>Öppettider</h3>
            <ul className="footer-hours">
              {location.openingHours.map((row) => (
                <li key={row.days}>
                  <span>{row.days}</span>
                  <span>{row.hours}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Adress &amp; kontakt</h3>
            {location.address && <p translate="no">{location.address}</p>}
            {location.phone && <p><PhoneLink phone={location.phone} /></p>}
            {location.email && <p><a href={`mailto:${location.email}`} translate="no">{location.email}</a></p>}
          </div>
        </div>
        <div className="site-footer-main">
          <p className="site-footer-rights">
            © {new Date().getFullYear()} <span translate="no">{legal.legalName}</span>
            {legal.orgNumber ? <> · org.nr <span translate="no">{legal.orgNumber}</span></> : null}
          </p>
          <nav className="site-footer-legal" aria-label="Juridiskt">
            <Link to="/integritetspolicy">Integritetspolicy</Link>
            <Link to="/cookies">Cookies</Link>
            {tenant.features.reservations && <Link to="/bokningsvillkor">Bokningsvillkor</Link>}
          </nav>
          <SoundToggle className="site-footer-sound" />
          <p className="site-footer-credit">Drivs av <span translate="no"><BooqyWordmark className="site-footer-booqy" /></span></p>
        </div>
      </footer>
    </div>
  )
}
