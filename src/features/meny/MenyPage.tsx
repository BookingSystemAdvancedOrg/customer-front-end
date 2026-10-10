import { Link } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { CategoryNav } from './CategoryNav'
import { DishImage } from './DishImage'
import { useMenuList } from './useMenuList'
import { CATEGORY_LABEL, formatPrice, menuImageUrl } from './menuApi'

/**
 * Menysidan: enbart läsning - hero, kategorinavigering (sidopanel på
 * skrivbord, dropdown på mobil, se CategoryNav) och rättkort med bild,
 * beskrivning och pris för EN kategori i taget, från den publika
 * GET /locations/{id}/menu för vald plats.
 */
export default function MenyPage() {
  const { configured, loading, error, filter, setFilter, visible } = useMenuList()
  const { config } = useSite()
  const tagline = config.tenant.branding.tagline

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">À la carte</p>
        <h1>Vår Meny</h1>
        <p className="hero-sub">
          {tagline || `Välkommen till ${config.tenant.name}.`}
        </p>
      </section>

      {!configured && (
        <p className="notice" role="status">
          Menyn är inte tillgänglig just nu - titta gärna förbi lite senare.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {configured && (
        <div className="menu-layout">
          <CategoryNav filter={filter} onSelect={setFilter} />

          <div className="menu-content">
            <h2 className="menu-content-title">{CATEGORY_LABEL[filter]}</h2>

            {loading && !error && (
              <p className="notice" role="status">
                Hämtar menyn…
              </p>
            )}
            {!loading && !error && visible.length === 0 && (
              <p className="notice" role="status">
                {`Inga rätter under ${CATEGORY_LABEL[filter]} just nu.`}
              </p>
            )}

            <div className="menu-grid">
              {visible.map((dish) => (
                <article className="dish-card" key={dish.menuItemId}>
                  <div className="dish-media">
                    <DishImage src={menuImageUrl(dish.imageKey)} alt={dish.name} />
                  </div>
                  <div className="dish-body">
                    <h3>{dish.name}</h3>
                    {dish.description && <p className="dish-desc">{dish.description}</p>}
                    <div className="dish-foot">
                      <span className="dish-price">{formatPrice(dish.price)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      <section className="dark-band">
        <h2>Allergier eller kostavvikelser?</h2>
        <p>
          Berätta för vår personal om dina allergier eller kostavvikelser, så
          hjälper vi dig att hitta rätt. Vi har glutenfria, laktosfria och
          veganska alternativ på menyn.
        </p>
      </section>

      {config.tenant.features.reservations && (
        <p className="menu-cta">
          Vill du äta hos oss? <Link to="/boka-bord">Boka bord →</Link>
        </p>
      )}
    </>
  )
}
