import { useCart } from '../../shared/useCart'
import { CategoryNav } from '../meny/CategoryNav'
import { DishImage } from '../meny/DishImage'
import { useMenuList } from '../meny/useMenuList'
import { CATEGORY_LABEL, formatPrice, menuImageUrl } from '../meny/menuApi'
import { FloatingCart } from './FloatingCart'

/**
 * Beställ mat: samma publika GET /locations/{id}/menu som Meny-sidan, med
 * identisk kategorinavigering (CategoryNav), men med "+ Lägg till"-knappen
 * och varukorgen inkopplad - Meny-sidan i sig är enbart läsning. Det finns
 * ingen beställnings-endpoint i backend än, så korgen är fortsatt en
 * minneslista (se useCart/cart.tsx) - den skickas inte någonstans, bara
 * visas för personalen på plats. Varukorgen (se FloatingCart.tsx) visas
 * bara här, inte i den globala headern, eftersom det bara är här man kan
 * lägga något i den.
 */
export default function BestallMatPage() {
  const { configured, loading, error, filter, setFilter, visible } = useMenuList()
  const { add } = useCart()

  return (
    <>
      <FloatingCart />

      <section className="page-hero">
        <p className="hero-kicker">Lägg i varukorgen</p>
        <h1>Beställ mat</h1>
        <p className="hero-sub">
          Bläddra i menyn och lägg till det du vill ha. Visa varukorgen för
          personalen när du beställer på plats.
        </p>
      </section>

      {!configured && (
        <p className="notice" role="status">
          Beställning är inte tillgänglig just nu - titta gärna förbi lite senare.
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
          </div>
        </div>
      )}
    </>
  )
}
