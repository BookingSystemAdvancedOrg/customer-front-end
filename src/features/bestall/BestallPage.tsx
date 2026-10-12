import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isApiConfigured } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'
import { normalizePhone, validEmail } from '../boka/bookingApi'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import { DishImage } from '../meny/DishImage'
import { CATEGORY_LABEL, getPublicMenu, groupByCategory, menuImageUrl } from '../meny/menuApi'
import type { PublicMenuItem } from '../meny/menuApi'
import {
  MAX_LINES,
  MAX_QUANTITY,
  NOTES_MAX,
  clearCart,
  closedMessage,
  createOrder,
  getOrdering,
  kronor,
  loadCart,
  orderErrorMessage,
  rememberToken,
  saveCart,
  stepQuantity,
  tableCodeFrom,
} from './orderApi'
import type { Cart, OrderMode, OrderingState } from './orderApi'

interface Guest {
  name: string
  phone: string
  email: string
  notes: string
  accept: boolean
}

const EMPTY_GUEST: Guest = { name: '', phone: '', email: '', notes: '', accept: false }

function guestError(g: Guest): string | null {
  if (!g.name.trim()) return 'Fyll i ditt namn.'
  if (!normalizePhone(g.phone)) return 'Fyll i ett giltigt mobilnummer, t.ex. 070-123 45 67.'
  if (!validEmail(g.email)) return 'Fyll i en giltig e-postadress - kvittot skickas dit.'
  if (g.notes.length > NOTES_MAX) return `Meddelandet får vara högst ${NOTES_MAX} tecken.`
  if (!g.accept) return 'Godkänn villkoren för att gå vidare till betalning.'
  return null
}

/** Pris i öre från menyns kronor (servern räknar likadant). */
function ore(price: number): number {
  return Math.round(price * 100)
}

/**
 * Beställ mat: gästen väljer rätter (1–20 av varje), fyller i namn, mobil och
 * e-post och betalar hos Stripe. Med QR-koden på bordet (?bord=<kod>) blir
 * det en beställning till bordet; annars avhämtning med sms när maten är
 * klar. Varukorgen sparas i fliken, så den finns kvar om gästen avbryter
 * betalningen.
 */
export default function BestallPage() {
  const { config, location } = useSite()
  const info = useLocationInfo()
  const { search } = useLocation()
  const locationId = location.locationId
  const [tableCode] = useState(() => tableCodeFrom(search))
  const cancelledOrder = new URLSearchParams(search).get('avbruten')
  const mode: OrderMode = tableCode ? 'table' : 'pickup'

  const [ordering, setOrdering] = useState<OrderingState | null>(null)
  const [stateError, setStateError] = useState<string | null>(null)
  const [menu, setMenu] = useState<PublicMenuItem[] | null>(null)
  const [cart, setCart] = useState<Cart>(() => loadCart(locationId))
  const [guest, setGuest] = useState<Guest>(EMPTY_GUEST)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const turnstileSiteKey = config.turnstile?.siteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)

  useEffect(() => {
    if (!isApiConfigured()) return
    let cancelled = false
    getOrdering(locationId, tableCode)
      .then((s) => !cancelled && setOrdering(s))
      .catch((err: unknown) => !cancelled && setStateError(orderErrorMessage(err)))
    getPublicMenu(locationId)
      .then((items) => !cancelled && setMenu(items))
      .catch(() => !cancelled && setMenu([]))
    return () => {
      cancelled = true
    }
  }, [locationId, tableCode])

  useEffect(() => saveCart(locationId, cart), [locationId, cart])

  const byId = useMemo(() => new Map((menu ?? []).map((d) => [d.menuItemId, d])), [menu])
  // Rätter som försvunnit från menyn (eller alkohol i avhämtning) räknas inte.
  const lines = Object.entries(cart)
    .map(([id, quantity]) => ({ dish: byId.get(id), quantity }))
    .filter((l): l is { dish: PublicMenuItem; quantity: number } =>
      Boolean(l.dish) && !(mode === 'pickup' && l.dish!.alcohol))
  const total = lines.reduce((sum, l) => sum + ore(l.dish.price) * l.quantity, 0)
  const groups = groupByCategory(menu ?? [])
  const open = Boolean(ordering?.open && ordering[mode])
  const tableLabel = ordering?.forTable?.label

  function change(id: string, delta: number) {
    setError(null)
    setCart((prev) => {
      const next = { ...prev }
      const quantity = stepQuantity(prev[id] ?? 0, delta)
      if (quantity === 0) delete next[id]
      else if (!prev[id] && Object.keys(prev).length >= MAX_LINES) return prev
      else next[id] = quantity
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!lines.length) return setError('Lägg till något från menyn först.')
    const problem = guestError(guest)
    if (problem) return setError(problem)
    if (turnstileSiteKey && !turnstileToken) return setError('Bekräfta säkerhetskontrollen ovanför knappen.')
    setBusy(true)
    try {
      const created = await createOrder({
        locationId,
        mode,
        ...(tableCode ? { tableCode } : {}),
        items: lines.map((l) => ({ menuItemId: l.dish.menuItemId, quantity: l.quantity })),
        name: guest.name.trim(),
        phone: guest.phone.trim(),
        email: guest.email.trim(),
        ...(guest.notes.trim() ? { notes: guest.notes.trim() } : {}),
        language: 'sv',
        acceptTerms: true,
        ...(turnstileToken ? { turnstileToken } : {}),
      })
      rememberToken(created.orderId, created.statusToken)
      clearCart(locationId)
      window.location.assign(created.checkoutUrl)
    } catch (err) {
      setError(orderErrorMessage(err))
      if (turnstileSiteKey) {
        setTurnstileToken(null)
        setTurnstileReset((n) => n + 1)
      }
      setBusy(false)
    }
  }

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">{mode === 'table' ? 'Beställ till bordet' : 'Avhämtning'}</p>
        <h1>Beställ</h1>
        <p className="hero-sub">
          {mode === 'table'
            ? `Beställ och betala här - vi serverar vid ${tableLabel ? (/^bord/i.test(tableLabel) ? tableLabel : `bord ${tableLabel}`) : 'ditt bord'}.`
            : `Beställ och betala här, hämta hos ${config.tenant.name}. Du får ett sms när maten är klar.`}
        </p>
      </section>

      {cancelledOrder && (
        <p className="notice" role="status">
          Betalningen avbröts - inget har dragits. Din varukorg finns kvar.
        </p>
      )}
      {stateError && (
        <p className="notice error" role="alert">
          {stateError}
        </p>
      )}
      {ordering && !open && (
        <p className="notice" role="status">
          {ordering.open && !ordering[mode]
            ? mode === 'table'
              ? 'Beställning vid bordet är inte påslagen - fråga personalen.'
              : 'Avhämtning går inte att beställa online just nu.'
            : closedMessage(ordering, info.phone)}
        </p>
      )}
      {ordering?.open && ordering.lastOrderAt && (
        <p className="order-hint">
          Sista beställning idag {ordering.lastOrderAt}
          {mode === 'pickup' && ordering.prepMinutes ? ` · klar ca ${ordering.prepMinutes} min efter betalning` : ''}
        </p>
      )}

      <div className="order-layout">
        <div className="order-menu">
          {menu === null && <p className="notice" role="status">Hämtar menyn…</p>}
          {groups.map((group) => (
            <section key={group.category} aria-label={CATEGORY_LABEL[group.category]}>
              <h2 className="menu-content-title">{CATEGORY_LABEL[group.category]}</h2>
              <div className="menu-grid">
                {group.items.map((dish) => {
                  const quantity = cart[dish.menuItemId] ?? 0
                  const blocked = mode === 'pickup' && dish.alcohol
                  return (
                    <article className="dish-card" key={dish.menuItemId}>
                      <div className="dish-media">
                        <DishImage src={menuImageUrl(dish.imageKey)} alt={dish.name} />
                      </div>
                      <div className="dish-body">
                        <h3>{dish.name}</h3>
                        {dish.description && <p className="dish-desc">{dish.description}</p>}
                        <div className="dish-foot">
                          <span className="dish-price">{kronor(ore(dish.price))}</span>
                          {blocked ? (
                            <span className="order-only-table">Bara vid bordet</span>
                          ) : quantity === 0 ? (
                            <button type="button" className="btn small" disabled={!open}
                              aria-label={`Lägg till ${dish.name}`} onClick={() => change(dish.menuItemId, 1)}>
                              Lägg till
                            </button>
                          ) : (
                            <span className="cart-qty" role="group" aria-label={`Antal ${dish.name}`}>
                              <button type="button" aria-label={`En ${dish.name} mindre`}
                                onClick={() => change(dish.menuItemId, -1)}>−</button>
                              <span aria-live="polite">{quantity}</span>
                              <button type="button" aria-label={`En ${dish.name} till`}
                                disabled={quantity >= MAX_QUANTITY} onClick={() => change(dish.menuItemId, 1)}>+</button>
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="order-cart" aria-label="Din beställning">
          <h2>Din beställning</h2>
          {lines.length === 0 ? (
            <p className="cart-empty">Varukorgen är tom.</p>
          ) : (
            <ul className="cart-list">
              {lines.map(({ dish, quantity }) => (
                <li key={dish.menuItemId}>
                  <span className="cart-item-name">{quantity} × {dish.name}</span>
                  <span className="cart-qty">
                    <button type="button" aria-label={`En ${dish.name} mindre`}
                      onClick={() => change(dish.menuItemId, -1)}>−</button>
                    <button type="button" aria-label={`En ${dish.name} till`}
                      disabled={quantity >= MAX_QUANTITY} onClick={() => change(dish.menuItemId, 1)}>+</button>
                  </span>
                  <span className="cart-item-price">{kronor(ore(dish.price) * quantity)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="cart-total">
            <span>Totalt</span>
            <span>{kronor(total)}</span>
          </div>
          <p className="cart-note">Högst {MAX_QUANTITY} av varje rätt. Priserna inkluderar moms.</p>

          <form className="order-form" onSubmit={submit} noValidate>
            <label className="booking-field">
              Namn
              <input autoComplete="name" value={guest.name}
                onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
            </label>
            <label className="booking-field">
              Mobilnummer {mode === 'pickup' ? '(sms när maten är klar)' : '(sms-bekräftelse)'}
              <input type="tel" autoComplete="tel" placeholder="070-123 45 67" value={guest.phone}
                onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
            </label>
            <label className="booking-field">
              E-post (kvitto)
              <input type="email" autoComplete="email" value={guest.email}
                onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
            </label>
            <label className="booking-field">
              Allergier eller önskemål (valfritt)
              <textarea rows={2} maxLength={NOTES_MAX} value={guest.notes}
                onChange={(e) => setGuest({ ...guest, notes: e.target.value })} />
            </label>
            <label className="booking-check">
              <input type="checkbox" checked={guest.accept}
                onChange={(e) => setGuest({ ...guest, accept: e.target.checked })} />
              <span>
                Jag betalar nu med kort. Beställningen kan inte ändras efter betalningen; avbryter
                restaurangen den återbetalas hela beloppet. Se{' '}
                <Link to="/integritetspolicy">integritetspolicyn</Link>.
              </span>
            </label>
            {turnstileSiteKey && (
              <TurnstileWidget siteKey={turnstileSiteKey} resetKey={turnstileReset} action="order"
                onToken={setTurnstileToken} />
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={!open || busy || lines.length === 0}>
              {busy ? 'Skickar…' : `Betala ${kronor(total)}`}
            </button>
          </form>
        </aside>
      </div>
    </>
  )
}
