import { useEffect, useState } from 'react'
import { isApiConfigured } from '../../shared/api'
import { isLocationConfigured, LOCATION_ID } from '../../shared/config'
import { useCart } from '../../shared/useCart'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  formatPrice,
  getPublicMenu,
  menuImageUrl,
} from './menuApi'
import type { MenuCategory, PublicMenuItem } from './menuApi'

/** Rättens bild med platshållare som reserv — samma mönster som admin. */
function DishImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span className="dish-placeholder" aria-hidden="true">
        🍽
      </span>
    )
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}

/**
 * Menysidan (Figma: menu-page): hero med rubrik, kategorifilter som pills,
 * rutnät av rättkort med bild, kategorimärke, pris och "+ Lägg till" som
 * lägger rätten i varukorgen, samt allergisektionen. Menyn hämtas från den
 * publika GET /locations/{id}/menu — bara aktiva rätter, ingen inloggning.
 */
export default function MenyPage() {
  const configured = isApiConfigured() && isLocationConfigured()
  const { add } = useCart()
  const [items, setItems] = useState<PublicMenuItem[]>([])
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MenuCategory | null>(null)

  useEffect(() => {
    if (!configured || !LOCATION_ID) return
    let cancelled = false
    getPublicMenu(LOCATION_ID)
      .then((fetched) => {
        if (!cancelled) setItems(fetched)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Menyn kunde inte hämtas.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [configured])

  const visible = (filter ? items.filter((it) => it.category === filter) : items)
    .slice()
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.name.localeCompare(b.name, 'sv'),
    )

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">Ett kulinariskt hantverk</p>
        <h1>Vår Meny</h1>
        <p className="hero-sub">
          Välkommen till KÄLLA. Vi serverar rätter skapade av säsongsbetonade
          råvaror, inspirerade av den nordiska naturen.
        </p>
        <div className="filter-row" role="group" aria-label="Filtrera på kategori">
          {CATEGORY_ORDER.map((category) => (
            <button
              key={category}
              type="button"
              className={`filter-pill${filter === category ? ' active' : ''}`}
              aria-pressed={filter === category}
              onClick={() =>
                setFilter((prev) => (prev === category ? null : category))
              }
            >
              {CATEGORY_LABEL[category]}
            </button>
          ))}
        </div>
      </section>

      {!configured && (
        <p className="notice" role="status">
          Menyn är inte tillgänglig just nu — titta gärna förbi lite senare.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {configured && loading && !error && (
        <p className="notice" role="status">
          Hämtar menyn…
        </p>
      )}
      {configured && !loading && !error && visible.length === 0 && (
        <p className="notice" role="status">
          {filter
            ? `Inga rätter under ${CATEGORY_LABEL[filter]} just nu.`
            : 'Menyn uppdateras just nu — titta gärna förbi lite senare.'}
        </p>
      )}

      <div className="menu-grid">
        {visible.map((dish) => (
          <article className="dish-card" key={dish.menuItemId}>
            <div className="dish-media">
              <span className="dish-badge">{CATEGORY_LABEL[dish.category]}</span>
              <DishImage src={menuImageUrl(dish.imageKey)} alt={dish.name} />
            </div>
            <div className="dish-body">
              <h3>{dish.name}</h3>
              {dish.description && <p className="dish-desc">{dish.description}</p>}
              <div className="dish-foot">
                <span className="dish-price">{formatPrice(dish.price)}</span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() =>
                    add({
                      menuItemId: dish.menuItemId,
                      name: dish.name,
                      price: dish.price,
                    })
                  }
                >
                  + Lägg till
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="dark-band">
        <h2>Allergier eller kostavvikelser?</h2>
        <p>
          Berätta för vår personal om dina allergier eller kostavvikelser, så
          hjälper vi dig att hitta rätt. Vi har glutenfria, laktosfria och
          veganska alternativ på menyn.
        </p>
      </section>
    </>
  )
}
