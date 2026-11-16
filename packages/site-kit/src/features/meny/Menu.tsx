import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@booqy/brand'
import { Plate } from '../../shared/Plate'
import { useMenuList } from './useMenuList'
import { allergenText, formatPrice, groupByCategory, menuImagePosition, menuImageUrl } from './menuApi'
import type { MenuCategory } from './menuApi'
import { SkelDishes } from '../../shared/Skeleton'

/**
 * Hela menyn som tallrikar sedda ovanifrån: alla kategorier i en lång lista
 * med en klistrig kategorirad som hoppar dit och visar var man är. Sajten
 * lägger sin egen hero ovanför (se site-template:s MenyPage).
 */
export function Menu({ hideHeading = false }: {
  /** Rubriken finns redan ovanför (blocket i webbplatsbyggaren): ingen egen "Meny". */
  hideHeading?: boolean
} = {}) {
  const { configured, loading, error, retry, items, categories } = useMenuList()
  const headingId = useId()
  const groups = groupByCategory(items, categories)
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
    <section className="menu" aria-labelledby={hideHeading ? undefined : headingId}>
      {!hideHeading && <h2 id={headingId} className="menu-heading">Meny</h2>}

      {!configured && (
        <p className="notice" role="status">
          Menyn är inte tillgänglig just nu - titta gärna förbi lite senare.
        </p>
      )}
      {error && (
        <div className="notice error notice--stack" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={retry}>Försök igen</Button>
        </div>
      )}
      {loading && !error && <SkelDishes />}
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
              {g.label}
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
          <h3 id={`cat-${group.category}`} className="menu-section-title">{group.label}</h3>
          <ul className="dish-list">
            {group.items.map((dish) => (
              <li className="dish" key={dish.menuItemId}>
                <Plate src={menuImageUrl(dish.imageKey)} position={menuImagePosition(dish.imageFocus)} name={dish.name} />
                <div className="dish-text">
                  <h4 className="dish-name">{dish.name}</h4>
                  {dish.description && <p className="dish-desc">{dish.description}</p>}
                  {allergenText(dish.allergens) && <p className="dish-allergens">{allergenText(dish.allergens)}</p>}
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
