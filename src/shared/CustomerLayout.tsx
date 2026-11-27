import { Suspense, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
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
import { useHeaderFit } from './headerFit'

/**
 * Kundsajtens skal: ett band i restaurangens färg med namn/logga, menyn,
 * öppet-just-nu (öppnar öppettiderna), språkväljare och platsväljare; footer med
 * öppettider, kontakt och juridiska länkar.
 *
 * Toppraden mäter sig själv (headerFit.ts): får inte allt plats på en rad
 * kortas öppet-texten först, sedan flyttar flikarna, öppet-knappen och till
 * sist språk och tema in i menyn bakom hamburgerknappen. Inga gissade
 * brytpunkter: det fungerar för hur många flikar, hur långt namn och vilket
 * språk som helst.
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
  const rowRef = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLAnchorElement>(null)
  const wordmarkRef = useRef<HTMLSpanElement>(null)
  const navListRef = useRef<HTMLUListElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)
  const chipFullRef = useRef<HTMLSpanElement>(null)
  const chipShortRef = useRef<HTMLSpanElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

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

  const status = openStatus(
    current.businessHours ?? {},
    current.specialDays ?? [],
    current.timezone ?? 'Europe/Stockholm',
  )
  const statusShort = status.open ? 'Öppet' : 'Stängt'
  const NAV = [...LEFT_NAV, ...RIGHT_NAV]

  const fit = useHeaderFit(
    {
      header: headerRef,
      row: rowRef,
      brand: brandRef,
      wordmark: wordmarkRef,
      navList: navListRef,
      chip: chipRef,
      chipFull: chipFullRef,
      chipShort: chipShortRef,
      tools: toolsRef,
      burger: menuBtnRef,
    },
    [tenant.name, tenant.branding.logoUrl ?? '', status.text, ...NAV.map((n) => n.label)].join('|'),
  )
  const navInRow = fit <= 1
  const chipInRow = fit <= 3
  const chipShortNow = fit === 1 || fit === 3
  const toolsInRow = fit <= 4
  const burgerInRow = fit >= 2

  // allt får plats igen: menyn har ingen knapp längre, så den stängs
  useEffect(() => {
    if (!burgerInRow) setMenuOpen(false)
  }, [burgerInRow])

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
      if (e.key === 'Escape') {
        // a list open inside the drawer (language) closes first
        if (e.defaultPrevented || document.querySelector('.combo-pop')) return
        closeMenu()
      }
    }
    document.addEventListener('keydown', onKey)
    // move focus into the drawer once it is visible
    const raf = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus()
    })
    // lock the root, not body: overflow on body makes body the scroller and the sticky header scrolls away
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
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


  // Tab stays inside the open drawer and its close button
  const trapTab = (e: ReactKeyboardEvent) => {
    if (!menuOpen || e.key !== 'Tab') return
    const drawer = drawerRef.current
    const burger = menuBtnRef.current
    if (!drawer || !burger) return
    const items = [
      burger,
      ...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ]
    // always step ourselves: the next element in the page after the menu
    // button is not the drawer (e.g. the location picker), so the browser's
    // own order would leave the drawer unreachable
    e.preventDefault()
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = i === -1 ? 0 : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length
    items[next].focus()
  }

  return (
    <div className="site" onKeyDown={trapTab}>
      <header className="site-header" ref={headerRef} data-fit={fit}>
        <div className="site-header-inner" ref={rowRef}>
          <Link
            ref={brandRef}
            className="site-header-brand"
            to="/"
            aria-label={`${tenant.name} - startsida`}
            title={tenant.name}
            onClick={closeMenu}
          >
            {tenant.branding.logoUrl ? (
              <img src={tenant.branding.logoUrl} alt="" width={44} height={44} />
            ) : null}
            <span className="site-header-wordmark" translate="no" ref={wordmarkRef}>{tenant.name}</span>
          </Link>

          <nav
            className={`site-header-nav${navInRow ? '' : ' site-header-off'}`}
            aria-label="Huvudmeny"
            aria-hidden={navInRow ? undefined : true}
            inert={!navInRow}
          >
            <ul ref={navListRef}>
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to}>{item.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <button
            ref={chipRef}
            type="button"
            className={`open-chip${status.open ? ' is-open' : ''}${chipShortNow ? ' open-chip--short' : ''}${chipInRow ? '' : ' site-header-off'}`}
            aria-haspopup="dialog"
            aria-expanded={hoursOpen}
            aria-hidden={chipInRow ? undefined : true}
            inert={!chipInRow}
            title={chipShortNow ? status.text : undefined}
            onClick={() => setHoursOpen(true)}
          >
            <span className="open-chip-dot" aria-hidden="true" />
            <span className="open-chip-text open-chip-text--full" ref={chipFullRef}>{status.text}</span>
            <span className="open-chip-text open-chip-text--short" ref={chipShortRef}>{statusShort}</span>
            {chipShortNow ? <span className="sr-only">: {status.text}</span> : null}
            <span className="sr-only"> - visa öppettider</span>
          </button>

          <div
            className={`site-header-tools${toolsInRow ? '' : ' site-header-off'}`}
            ref={toolsRef}
            aria-hidden={toolsInRow ? undefined : true}
            inert={!toolsInRow}
          >
            <LanguagePicker className="site-header-lang" />
            <ThemeToggle className="site-header-theme" />
          </div>

          <button
            ref={menuBtnRef}
            type="button"
            className={`site-header-burger${menuOpen ? ' site-header-burger--open' : ''}${burgerInRow ? '' : ' site-header-off'}`}
            aria-hidden={burgerInRow ? undefined : true}
            inert={!burgerInRow}
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
        ref={drawerRef}
        className={`mobile-drawer${menuOpen ? ' mobile-drawer--open' : ''}`}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
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
                className={`mobile-drawer-hours-trigger${status.open ? ' is-open' : ''}`}
                onClick={() => {
                  closeMenu()
                  setHoursOpen(true)
                }}
              >
                <span>Öppettider</span>
                <span className="mobile-drawer-status">
                  <span className="open-chip-dot" aria-hidden="true" />
                  {status.text}
                </span>
              </button>
            </li>
          </ul>
        </nav>
        {toolsInRow ? null : (
          <div className="mobile-drawer-tools">
            <LanguagePicker className="mobile-drawer-lang" />
            <ThemeToggle className="mobile-drawer-theme" />
          </div>
        )}
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
