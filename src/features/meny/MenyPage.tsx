import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { Plate } from '../../shared/Plate'
import { openStatus } from '../../shared/locationApi'
import { useMenuList } from './useMenuList'
import { CATEGORY_LABEL, formatPrice, groupByCategory, menuImageUrl } from './menuApi'
import type { MenuCategory } from './menuApi'

/**
 * Startsidan: restaurangen (namn, tagline, öppet just nu, foto eller
 * restaurangens färg) med de två viktigaste knapparna, Beställ och Boka
 * bord, och sedan hela menyn som tallrikar sedda ovanifrån - alla
 * kategorier i en lång lista med en klistrig kategorirad som hoppar dit
 * och visar var man är.
 */
export default function MenyPage() {
  const { configured, loading, error, items } = useMenuList()
  const { config, location } = useSite()
  const { tenant } = config
  const groups = groupByCategory(items)
  const status = openStatus(location.businessHours ?? {}, location.specialDays ?? [], location.timezone ?? 'Europe/Stockholm')
  const canOrder = Boolean(tenant.features.ordering && location.ordering?.pickup)
  const canBook = Boolean(tenant.features.reservations)
  const [active, setActive] = useState<MenuCategory | null>(null)
  const sectionRefs = useRef(new Map<MenuCategory, HTMLElement>())

  // Kategoriraden markerar den kategori man scrollat till.
  useEffect(() => {
    if (!groups.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.getAttribute('data-category') as MenuCategory)
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    sectionRefs.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [groups.length])

  function jump(category: MenuCategory) {
    setActive(category)
    sectionRefs.current.get(category)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <section className={`home-hero${tenant.branding.heroImageUrl ? ' home-hero--photo' : ''}`}>
        {tenant.branding.heroImageUrl && <img className="home-hero-img" src={tenant.branding.heroImageUrl} alt="" />}
        <div className="home-hero-body">
          <h1>{location.name && config.locations.length > 1 ? location.name : tenant.name}</h1>
          {tenant.branding.tagline && <p className="home-hero-tagline">{tenant.branding.tagline}</p>}
          <p className={`home-hero-status${status.open ? ' is-open' : ''}`}>
            <span className="open-chip-dot" aria-hidden="true" />
            {status.text}
            {location.address ? <span className="home-hero-address"> · {location.address}</span> : null}
          </p>
          {(canOrder || canBook) && (
            <div className="home-hero-actions">
              {canOrder && (
                <Link className="action action--primary" to="/bestall">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
                  Beställ mat
                </Link>
              )}
              {canBook && (
                <Link className={`action${canOrder ? ' action--secondary' : ' action--primary'}`} to="/boka-bord">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" /><circle cx="12" cy="3.5" r="1.5" /><circle cx="12" cy="20.5" r="1.5" /><circle cx="3.5" cy="12" r="1.5" /><circle cx="20.5" cy="12" r="1.5" /></svg>
                  Boka bord
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="menu" aria-labelledby="menu-heading">
        <h2 id="menu-heading" className="menu-heading">Meny</h2>

        {!configured && (
          <p className="notice" role="status">
            Menyn är inte tillgänglig just nu - titta gärna förbi lite senare.
          </p>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        {loading && !error && <p className="notice" role="status">Hämtar menyn…</p>}
        {!loading && !error && configured && groups.length === 0 && (
          <p className="notice" role="status">Menyn är tom just nu.</p>
        )}

        {groups.length > 1 && (
          <nav className="chip-rail" aria-label="Kategorier">
            {groups.map((g) => (
              <button
                key={g.category}
                type="button"
                className={`chip${(active ?? groups[0].category) === g.category ? ' is-active' : ''}`}
                aria-current={(active ?? groups[0].category) === g.category ? 'true' : undefined}
                onClick={() => jump(g.category)}
              >
                {CATEGORY_LABEL[g.category]}
                <span className="chip-count">{g.items.length}</span>
              </button>
            ))}
          </nav>
        )}

        {groups.map((group) => (
          <section
            key={group.category}
            className="menu-section"
            data-category={group.category}
            aria-labelledby={`cat-${group.category}`}
            ref={(el) => {
              if (el) sectionRefs.current.set(group.category, el)
              else sectionRefs.current.delete(group.category)
            }}
          >
            <h3 id={`cat-${group.category}`} className="menu-section-title">{CATEGORY_LABEL[group.category]}</h3>
            <ul className="dish-list">
              {group.items.map((dish) => (
                <li className="dish" key={dish.menuItemId}>
                  <Plate src={menuImageUrl(dish.imageKey)} name={dish.name} />
                  <div className="dish-text">
                    <h4 className="dish-name">{dish.name}</h4>
                    {dish.description && <p className="dish-desc">{dish.description}</p>}
                  </div>
                  <span className="dish-price">{formatPrice(dish.price)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="menu-allergy">
          Allergier eller kostavvikelser? Fråga personalen, så hjälper vi dig att hitta rätt.
        </p>
      </section>
    </>
  )
}
