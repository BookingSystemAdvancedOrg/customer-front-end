import { useEffect, useState } from 'react'
import { isApiConfigured } from '../../shared/api'
import { isLocationConfigured, LOCATION_ID } from '../../shared/config'
import {
  CATEGORY_LABEL,
  formatPrice,
  getPublicMenu,
  groupByCategory,
  menuImageUrl,
} from './menuApi'
import type { PublicMenuItem } from './menuApi'

/**
 * Rättens bild med platshållare som reserv — samma mönster som admin:
 * svarar CDN:et fel (eller saknas bas-URL:en) visas platshållaren i stället
 * för en trasig bildikon.
 */
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
 * Menysidan: hämtar den publika menyn (bara aktiva rätter, ingen inloggning)
 * och visar den grupperad per kategori. Utan konfigurerat API/plats-ID visas
 * ett vänligt meddelande i stället för ett fel.
 */
export default function MenyPage() {
  const configured = isApiConfigured() && isLocationConfigured()
  const [items, setItems] = useState<PublicMenuItem[]>([])
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState<string | null>(null)

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

  const groups = groupByCategory(items)

  return (
    <>
      <div className="page-head">
        <h1>Vår meny</h1>
        <p>Alla priser i kronor. Fråga gärna personalen om allergener.</p>
      </div>

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
      {configured && !loading && !error && groups.length === 0 && (
        <p className="notice" role="status">
          Menyn uppdateras just nu — titta gärna förbi lite senare.
        </p>
      )}

      {groups.map((group) => (
        <section className="menu-section" key={group.category}>
          <h2>{CATEGORY_LABEL[group.category]}</h2>
          <div className="menu-grid">
            {group.items.map((dish) => (
              <article className="dish-card" key={dish.menuItemId}>
                <div className="dish-media">
                  <DishImage src={menuImageUrl(dish.imageKey)} alt={dish.name} />
                </div>
                <div className="dish-body">
                  <div className="dish-title-row">
                    <h3>{dish.name}</h3>
                    <span className="dish-price">{formatPrice(dish.price)}</span>
                  </div>
                  {dish.description && (
                    <p className="dish-desc">{dish.description}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
