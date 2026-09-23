import { useState } from 'react'
import { formatPrice } from '../meny/menuApi'
import { useCart } from '../../shared/useCart'

/**
 * Varukorgen hör bara hemma på Beställ mat — det är enda stället man kan
 * lägga något i den. Flyter fritt (position: fixed) uppe till höger, precis
 * under headern, oberoende av var på sidan man skrollat till.
 */
export function FloatingCart() {
  const { items, count, total, setQuantity, clear } = useCart()
  const [open, setOpen] = useState(false)

  return (
    <div className="floating-cart">
      <button
        type="button"
        className="cart-button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span aria-hidden="true">🛒</span> Varukorg
        {count > 0 && <span className="cart-badge">{count}</span>}
      </button>

      {open && (
        <div className="cart-panel" role="dialog" aria-label="Varukorg">
          <div className="cart-head">
            <h2>Varukorg</h2>
            <button
              type="button"
              className="cart-close"
              onClick={() => setOpen(false)}
              aria-label="Stäng varukorgen"
            >
              ✕
            </button>
          </div>
          {items.length === 0 ? (
            <p className="cart-empty">Varukorgen är tom — utforska menyn!</p>
          ) : (
            <>
              <ul className="cart-list">
                {items.map((it) => (
                  <li key={it.menuItemId}>
                    <span className="cart-item-name">{it.name}</span>
                    <span className="cart-qty">
                      <button
                        type="button"
                        onClick={() => setQuantity(it.menuItemId, it.quantity - 1)}
                        aria-label={`Färre ${it.name}`}
                      >
                        −
                      </button>
                      {it.quantity}
                      <button
                        type="button"
                        onClick={() => setQuantity(it.menuItemId, it.quantity + 1)}
                        aria-label={`Fler ${it.name}`}
                      >
                        +
                      </button>
                    </span>
                    <span className="cart-item-price">
                      {formatPrice(it.price * it.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="cart-total">
                <span>Totalt</span>
                <span>{formatPrice(total)}</span>
              </div>
              <p className="cart-note">
                Onlinebeställning öppnar snart — visa gärna listan för
                personalen när du beställer.
              </p>
              <button type="button" className="link-clear" onClick={clear}>
                Töm varukorgen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
