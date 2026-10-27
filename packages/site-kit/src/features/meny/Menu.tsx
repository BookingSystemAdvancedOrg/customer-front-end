import { useEffect, useRef, useState } from 'react'
import { Plate } from '../../shared/Plate'
import { useMenuList } from './useMenuList'
import { CATEGORY_LABEL, formatPrice, groupByCategory, menuImageUrl } from './menuApi'
import type { MenuCategory } from './menuApi'

/**
 * Hela menyn som tallrikar sedda ovanifrån: alla kategorier i en lång lista
 * med en klistrig kategorirad som hoppar dit och visar var man är. Sajten
 * lägger sin egen hero ovanför (se site-template:s MenyPage).
 */
export function Menu() {
  const { configured, loading, error, items } = useMenuList()
  const groups = groupByCategory(items)
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
  )
}
