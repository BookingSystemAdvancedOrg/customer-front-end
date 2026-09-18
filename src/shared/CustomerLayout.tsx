import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { formatPrice } from '../features/meny/menuApi'
import { RESTAURANT } from './restaurant'
import { useCart } from './useCart'
import './customer.css'

/**
 * Kundsajtens skal (Figma: alla fyra sidorna): informationsrad överst,
 * header med logotyp/nav/varukorg, sidinnehåll i <Outlet /> och den mörka
 * footern. Ingen inloggning finns — sajten är publik och skrivskyddad.
 */

/**
 * Varukorgspanelen. Backend har ingen beställnings-endpoint än, så korgen
 * är en minneslista — panelen säger det ärligt i stället för att låtsas
 * kunna skicka en beställning.
 */
function CartPanel({ onClose }: { onClose: () => void }) {
  const { items, total, setQuantity, clear } = useCart()
  return (
    <div className="cart-panel" role="dialog" aria-label="Varukorg">
      <div className="cart-head">
        <h2>Varukorg</h2>
        <button type="button" className="cart-close" onClick={onClose} aria-label="Stäng varukorgen">
          ✕
        </button>
      </div>
      {items.length === 0 ? (
        <p className="cart-empty">Varukorgen är tom — utforska vår meny!</p>
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
            Onlinebeställning öppnar snart — visa gärna listan för personalen
            när du beställer.
          </p>
          <button type="button" className="link-clear" onClick={clear}>
            Töm varukorgen
          </button>
        </>
      )}
    </div>
  )
}

export function CustomerLayout() {
  const { count } = useCart()
  const [cartOpen, setCartOpen] = useState(false)

  return (
    <div className="site">
      <p className="announce-bar">{RESTAURANT.announcement}</p>
      <header className="site-topbar">
        <Link to="/" className="site-logo">
          <span className="logo-mark" aria-hidden="true">
            K
          </span>
          <span className="logo-text">
            {RESTAURANT.name}
            <small>{RESTAURANT.logoTagline}</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Huvudmeny">
          <NavLink to="/meny">Meny</NavLink>
          <NavLink to="/om-oss">Om oss</NavLink>
          <NavLink to="/boka-bord">Boka Bord</NavLink>
        </nav>
        <button
          type="button"
          className="cart-button"
          onClick={() => setCartOpen((open) => !open)}
          aria-expanded={cartOpen}
        >
          <span aria-hidden="true">🛒</span> Varukorg
          {count > 0 && <span className="cart-badge">{count}</span>}
        </button>
        {cartOpen && <CartPanel onClose={() => setCartOpen(false)} />}
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-cols">
          <div className="footer-brand">
            <h2>{RESTAURANT.name}</h2>
            <p>{RESTAURANT.tagline}</p>
          </div>
          <div>
            <h3>Öppettider</h3>
            <ul className="footer-hours">
              {RESTAURANT.openingHours.map((row) => (
                <li key={row.days}>
                  {row.days}: {row.hours}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Adress &amp; kontakt</h3>
            <p>{RESTAURANT.address}</p>
            <p>{RESTAURANT.phone}</p>
            <p>{RESTAURANT.email}</p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {RESTAURANT.name}. Alla rättigheter
            förbehållna.
          </span>
          <span>Integritetspolicy · Allmänna villkor</span>
        </div>
      </footer>
    </div>
  )
}
