import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isApiConfigured } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'
import { normalizePhone, validEmail } from '../boka/bookingApi'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import { Plate } from '../../shared/Plate'
import { CATEGORY_LABEL, getPublicMenu, groupByCategory, menuImageUrl } from '../meny/menuApi'
import type { PublicMenuItem } from '../meny/menuApi'
import {
  MAX_LINES,
  MAX_ORDER_ORE,
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
  const tooLarge = total > MAX_ORDER_ORE
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

  const trayRef = useRef<HTMLSpanElement>(null)
  const barRef = useRef<HTMLAnchorElement>(null)

  /** Lägg till och låt tallriken glida till beställningen (brickan). */
  function add(id: string, from: HTMLElement) {
    change(id, 1)
    const plate = from.closest('.dish')?.querySelector<HTMLElement>('.plate')
    const bar = barRef.current && barRef.current.offsetParent ? barRef.current : null
    const target = bar ?? trayRef.current
    if (!plate || !target || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const a = plate.getBoundingClientRect()
    const b = target.getBoundingClientRect()
    if (!a.width || !b.width) return
    const ghost = plate.cloneNode(true) as HTMLElement
    ghost.classList.add('plate-flying')
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` })
    document.body.appendChild(ghost)
    const dx = b.left + Math.min(b.width, 40) / 2 - (a.left + a.width / 2)
    const dy = b.top + b.height / 2 - (a.top + a.height / 2)
    const anim = ghost.animate?.(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 40}px) scale(0.7)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.28)`, opacity: 0.4 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    if (anim) anim.onfinish = () => ghost.remove()
    else ghost.remove()
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
      <section className="page-head">
        <h1>{mode === 'table' ? 'Beställ till bordet' : 'Beställ för avhämtning'}</h1>
        <p className="page-lede">
          {mode === 'table'
            ? `Välj, betala i mobilen - vi serverar vid ${tableLabel ? (/^bord/i.test(tableLabel) ? tableLabel : `bord ${tableLabel}`) : 'ditt bord'}.`
            : `Välj, betala här och hämta hos ${config.tenant.name}. Du får ett sms när maten är klar.`}
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
          {groups.length > 1 && (
            <nav className="chip-rail" aria-label="Kategorier">
              {groups.map((g) => (
                <a key={g.category} className="chip" href={`#bestall-${g.category}`}>
                  {CATEGORY_LABEL[g.category]}
                  <span className="chip-count">{g.items.length}</span>
                </a>
              ))}
            </nav>
          )}
          {groups.map((group) => (
            <section key={group.category} id={`bestall-${group.category}`} className="menu-section" aria-label={CATEGORY_LABEL[group.category]}>
              <h2 className="menu-section-title">{CATEGORY_LABEL[group.category]}</h2>
              <ul className="dish-list">
                {group.items.map((dish) => {
                  const quantity = cart[dish.menuItemId] ?? 0
                  const blocked = mode === 'pickup' && dish.alcohol
                  return (
                    <li className={`dish dish--order${quantity ? ' is-in-cart' : ''}`} key={dish.menuItemId} data-dish={dish.menuItemId}>
                      <Plate src={menuImageUrl(dish.imageKey)} name={dish.name} />
                      <div className="dish-text">
                        <h3 className="dish-name">{dish.name}</h3>
                        {dish.description && <p className="dish-desc">{dish.description}</p>}
                        <span className="dish-price">{kronor(ore(dish.price))}</span>
                      </div>
                      <div className="dish-action">
                        {blocked ? (
                          <span className="order-only-table">Bara vid bordet</span>
                        ) : quantity === 0 ? (
                          <button type="button" className="add-btn" disabled={!open}
                            aria-label={`Lägg till ${dish.name}`} onClick={(e) => add(dish.menuItemId, e.currentTarget)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          </button>
                        ) : (
                          <span className="stepper" role="group" aria-label={`Antal ${dish.name}`}>
                            <button type="button" aria-label={`En ${dish.name} mindre`}
                              onClick={() => change(dish.menuItemId, -1)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                            </button>
                            <span aria-live="polite">{quantity}</span>
                            <button type="button" aria-label={`En ${dish.name} till`}
                              disabled={quantity >= MAX_QUANTITY} onClick={(e) => add(dish.menuItemId, e.currentTarget)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                            </button>
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="order-cart" id="order-cart" aria-label="Din beställning">
          <div className="tray-head">
            <h2>Din beställning</h2>
            <span className="tray-plates" aria-hidden="true" ref={trayRef}>
              {lines.slice(0, 5).map(({ dish }) => (
                <Plate key={dish.menuItemId} src={menuImageUrl(dish.imageKey)} name={dish.name} size="sm" />
              ))}
            </span>
          </div>
          {lines.length === 0 ? (
            <p className="cart-empty">Tryck på + vid en rätt för att lägga den här.</p>
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
          <p className="cart-note">Priserna inkluderar moms.</p>

          {lines.length > 0 && (
          <form className="order-form" onSubmit={submit} noValidate>
            <label className="booking-field">
              Namn
              <input autoComplete="name" value={guest.name}
                onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
            </label>
            <label className="booking-field">
              Mobilnummer
              <span className="field-hint">
                {mode === 'pickup' ? 'Vi sms:ar när maten lagas och när den är klar.' : 'Vi sms:ar när maten lagas.'}
              </span>
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
                Jag förstår att beställningen inte kan ändras efter betalning. Avbryter restaurangen får
                jag pengarna tillbaka. <Link to="/integritetspolicy">Integritetspolicy</Link>
              </span>
            </label>
            {turnstileSiteKey && (
              <TurnstileWidget siteKey={turnstileSiteKey} resetKey={turnstileReset} action="order"
                onToken={setTurnstileToken} />
            )}
            {tooLarge && (
              <p className="notice error" role="alert">
                Beställningen är för stor för att betalas online (högst {kronor(MAX_ORDER_ORE)}). Minska antalet eller
                kontakta restaurangen.
              </p>
            )}
            {error && !tooLarge && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={!open || busy || lines.length === 0 || tooLarge}>
              {busy ? 'Skickar…' : `Betala ${kronor(total)}`}
            </button>
          </form>
          )}
        </aside>
      </div>

      {lines.length > 0 && (
        <a className="order-mobile-bar" href="#order-cart" ref={barRef}>
          <span className="order-mobile-bar-count">{lines.reduce((n, l) => n + l.quantity, 0)}</span>
          <strong>Visa beställning</strong>
          <span className="order-mobile-bar-total">{kronor(total)}</span>
        </a>
      )}
    </>
  )
}
