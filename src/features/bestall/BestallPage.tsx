import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isApiConfigured } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'
import { PhoneInput } from '../../shared/PhoneInput'
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
  MENU_ITEM_REMOVED,
  getOrdering,
  kronor,
  loadCart,
  orderErrorMessage,
  rememberToken,
  saveCart,
  stepQuantity,
  tableCodeFrom,
  vatBreakdown,
  vatRate,
} from './orderApi'
import type { Cart, OrderCreated, OrderMode, OrderingState } from './orderApi'
import { checkCode, codeErrorMessage, discounted, normalizeCode } from '../erbjudande/offerApi'
import type { CodeTerms } from '../erbjudande/offerApi'
import { useStickyCart } from '../../shared/useStickyCart'
import { PaymentPanel, SecureNote } from '../../shared/payment/PaymentTicket'
import type { PayStatus } from '../../shared/payment/PaymentTicket'
import { GuestDataNotice } from '../../shared/GuestDataNotice'
import { MarketingConsent, NO_CONSENT, consentFields } from '../../shared/MarketingConsent'
import type { ConsentChoice } from '../../shared/MarketingConsent'

const STEPS = [{ label: 'Varukorg' }, { label: 'Dina uppgifter' }, { label: 'Betala' }, { label: 'Klart' }]

interface Guest {
  name: string
  phone: string
  email: string
  notes: string
  accept: boolean
  consent: ConsentChoice
}

const EMPTY_GUEST: Guest = { name: '', phone: '', email: '', notes: '', accept: false, consent: NO_CONSENT }

/** Kassan i brickan: en fråga i taget, så att ingen ser allt på en gång. */
type Step = 'cart' | 'who' | 'receipt' | 'confirm'

const STEP_ORDER: Step[] = ['cart', 'who', 'receipt', 'confirm']

const STEP_TITLE: Record<Step, string> = {
  cart: 'Din beställning',
  who: 'Vem är du?',
  receipt: 'Kvitto och önskemål',
  confirm: 'Godkänn och betala',
}

/** Det som saknas i ett steg (null när steget är klart). */
function stepError(step: Step, g: Guest): string | null {
  if (step === 'who') {
    if (!g.name.trim()) return 'Fyll i ditt namn.'
    if (!normalizePhone(g.phone)) return 'Fyll i ett giltigt mobilnummer, t.ex. 070-123 45 67.'
  }
  if (step === 'receipt') {
    if (!validEmail(g.email)) return 'Fyll i en giltig e-postadress - kvittot skickas dit.'
    if (g.notes.length > NOTES_MAX) return `Meddelandet får vara högst ${NOTES_MAX} tecken.`
  }
  if (step === 'confirm' && !g.accept) return 'Godkänn villkoren för att gå vidare till betalning.'
  return null
}

/** Första steget med något som saknas. */
function firstGap(g: Guest): Step | null {
  return STEP_ORDER.find((step) => stepError(step, g)) ?? null
}

/** Pris i öre från menyns kronor (servern räknar likadant). */
function ore(price: number): number {
  return Math.round(price * 100)
}

/**
 * Beställ mat: gästen väljer rätter (1-20 av varje), fyller i namn, mobil och
 * e-post och betalar här på sidan (steg 3: kvittot med Stripes formulär i
 * sajtens tryck, shared/payment). Med QR-koden på bordet (?bord=<kod>) blir
 * det en beställning till bordet; annars avhämtning med sms när maten är
 * klar. Varukorgen sparas i fliken tills betalningen gått igenom, så den
 * finns kvar om gästen går tillbaka och ändrar.
 */
export default function BestallPage() {
  const { config, location } = useSite()
  const info = useLocationInfo()
  const { search } = useLocation()
  const navigate = useNavigate()
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
  // Beställningen är registrerad: betalningskvittot visas (steg 3).
  const [payment, setPayment] = useState<OrderCreated | null>(null)
  const [payStatus, setPayStatus] = useState<PayStatus>({ ready: false, busy: false, paid: false })
  const [checkout, setCheckout] = useState<Step>('cart')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const stepMoved = useRef(false)
  const headRef = useRef<HTMLDivElement>(null)
  const turnstileSiteKey = config.turnstile?.siteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const marketing = Boolean(config.tenant.features.marketing)
  // Rabattkoden: från länken i mejlet (?kod=) eller inskriven.
  const [codeInput, setCodeInput] = useState(() => new URLSearchParams(search).get('kod') ?? '')
  const [code, setCode] = useState<CodeTerms | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)
  const [codeOpen, setCodeOpen] = useState(() => Boolean(new URLSearchParams(search).get('kod')))

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
  const subtotal = lines.reduce((sum, l) => sum + ore(l.dish.price) * l.quantity, 0)
  const belowMin = Boolean(code && subtotal < code.minOrderOre)
  const applied = code && !belowMin ? code : null
  const total = applied
    ? lines.reduce((sum, l) => sum + discounted(ore(l.dish.price), applied.percent) * l.quantity, 0)
    : subtotal
  const groups = groupByCategory(menu ?? [])
  // Servern prövar beloppet före rabatten.
  const tooLarge = subtotal > MAX_ORDER_ORE
  const open = Boolean(ordering?.open && ordering[mode])
  const tableLabel = ordering?.forTable?.label
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  // Utan rätter finns bara brickan.
  const step: Step = lines.length ? checkout : 'cart'
  // Stegraden: rätter -> uppgifter -> betala. Betala när sista steget är ifyllt.
  const stepAt = payment ? 3 : step === 'cart' ? 1 : step === 'confirm' && !firstGap(guest) ? 3 : 2

  /** Till ett annat steg i kassan: fokus på rubriken, och sidan står still. */
  function go(next: Step) {
    setError(null)
    stepMoved.current = true
    setCheckout(next)
  }

  useEffect(() => {
    if (!stepMoved.current) return
    stepMoved.current = false
    const title = titleRef.current
    if (!title) return
    title.focus({ preventScroll: true })
    // Hamnar brickans överkant utanför fönstret (mobil: korta steg gör sidan
    // kortare) glider den in under sidhuvudet; annars rör sig inget.
    const cart = title.closest('.checkout, .order-cart')
    if (!cart) return
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0
    const top = cart.getBoundingClientRect().top
    if (top >= header && top <= window.innerHeight - 160) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollBy?.({ top: top - header - 16, behavior: reduce ? 'auto' : 'smooth' })
  }, [step, payment])

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
  // Mobil: knappen "Visa beställning" behövs bara när brickan inte syns.
  const [cartInView, setCartInView] = useState(false)
  useEffect(() => {
    const el = document.getElementById('order-cart')
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setCartInView(entry.isIntersecting), { threshold: 0.15 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [payment, step])
  const cartRef = useStickyCart<HTMLElement>()
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

  async function applyCode(value = codeInput) {
    setCodeError(null)
    const normalized = normalizeCode(value)
    if (!normalized) {
      setCode(null)
      return setCodeError('Koden ska se ut som ABCD-EFGH.')
    }
    setCodeBusy(true)
    try {
      setCode(await checkCode(locationId, normalized))
      setCodeInput(normalized)
    } catch (err) {
      setCode(null)
      setCodeError(codeErrorMessage(err))
    } finally {
      setCodeBusy(false)
    }
  }

  // En kod från mejlets länk kontrolleras direkt.
  const fromLink = useRef(codeInput)
  useEffect(() => {
    if (marketing && fromLink.current) void applyCode(fromLink.current)
    fromLink.current = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketing])

  /** Knappen i varje steg: kolla steget och gå vidare, i sista steget skicka. */
  function next(e: FormEvent) {
    e.preventDefault()
    if (step === 'confirm') return void submit()
    if (!lines.length || tooLarge || !open) return
    const problem = stepError(step, guest)
    if (problem) return setError(problem)
    go(STEP_ORDER[STEP_ORDER.indexOf(step) + 1])
  }

  function previous() {
    go(STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(step) - 1)])
  }

  async function submit() {
    setError(null)
    if (!lines.length) return setError('Lägg till något från menyn först.')
    const gap = firstGap(guest)
    if (gap) {
      const problem = stepError(gap, guest)
      if (gap !== step) go(gap)
      return setError(problem)
    }
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
        ...(applied ? { discountCode: applied.code } : {}),
        ...consentFields(guest.consent, config.privacy, marketing),
        embedded: true,
      })
      rememberToken(created.orderId, created.statusToken)
      stepMoved.current = true
      setPayStatus({ ready: false, busy: false, paid: false })
      setPayment(created)
      setBusy(false)
    } catch (err) {
      setError(orderErrorMessage(err))
      if (err instanceof Error && /^discount_/.test(err.message)) setCode(null)
      if (err instanceof Error && err.message === 'menu_item_unavailable') {
        // En rätt har gått ut eller stängts av sedan menyn hämtades: hämta om
        // menyn så att rätten försvinner ur varukorgen.
        // Bara när en rätt verkligen plockats bort sägs det; annars gäller
        // den neutrala texten.
        await getPublicMenu(locationId)
          .then((items) => {
            setMenu(items)
            const ids = new Set(items.map((d) => d.menuItemId))
            if (Object.keys(cart).some((id) => !ids.has(id))) {
              setCart((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))))
              // Tillbaka till brickan, så att gästen ser vad som ändrats.
              go('cart')
              setError(MENU_ITEM_REMOVED)
            }
          })
          .catch(() => undefined)
      }
      if (turnstileSiteKey) {
        setTurnstileToken(null)
        setTurnstileReset((n) => n + 1)
      }
      setBusy(false)
    }
  }

  const paid = useCallback(() => {
    if (!payment) return
    clearCart(locationId)
    navigate(`/bestallning/${encodeURIComponent(payment.locationId)}/${encodeURIComponent(payment.orderId)}`)
  }, [payment, locationId, navigate])

  /** Tillbaka till varukorgen: beställningen som inte betalades går ut av sig själv. */
  function back() {
    stepMoved.current = true
    setCheckout('cart')
    setPayment(null)
    if (turnstileSiteKey) {
      setTurnstileToken(null)
      setTurnstileReset((n) => n + 1)
    }
  }

  // Summan som betalas: serverns belopp när beställningen finns, annars sidans.
  const payTotal = payment ? payment.totalAmount : total
  const vat = vatBreakdown(lines.map((l) => ({
    rate: vatRate(Boolean(l.dish.alcohol), mode),
    total: (applied ? discounted(ore(l.dish.price), applied.percent) : ore(l.dish.price)) * l.quantity,
  })))
  const place = mode === 'table'
    ? (tableLabel ? (/^bord/i.test(tableLabel) ? tableLabel : `Bord ${tableLabel}`) : 'Ditt bord')
    : `Hämtas hos ${config.tenant.name}${location.name ? `, ${location.name}` : ''}`

  /** Sammanfattningen till höger (och i "Visa beställning" på mobilen). */
  const summary = (
    <>
      <ul className="sum-lines">
        {lines.map(({ dish, quantity }) => (
          <li key={dish.menuItemId}>
            <Plate src={menuImageUrl(dish.imageKey)} name={dish.name} size="sm" />
            <span className="sum-line-text">
              <span className="sum-line-name">{dish.name}</span>
              <span className="sum-line-qty">{kronor(ore(dish.price))} × {quantity}</span>
            </span>
            <span className="sum-line-price">{kronor(ore(dish.price) * quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="sum-rows">
        <div><dt>Delsumma</dt><dd>{kronor(subtotal)}</dd></div>
        {applied && <div><dt>Rabatt {applied.percent} % ({applied.code})</dt><dd>-{kronor(subtotal - total)}</dd></div>}
        {vat.map((v) => <div key={v.rate}><dt>Varav moms {v.rate} %</dt><dd>{kronor(v.vat)}</dd></div>)}
      </dl>
      <div className="sum-total"><span>Totalt</span><span>{kronor(payTotal)}</span></div>
    </>
  )

  const crumbs = (
    <ol className="crumbs" aria-label={`Beställning: steg ${stepAt} av ${STEPS.length}`}>
      {STEPS.map((s, i) => {
        const n = i + 1
        const state = n < stepAt ? 'done' : n === stepAt ? 'current' : 'next'
        return (
          <li key={s.label} className={`crumb is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            {n === 1 && state === 'done' && !payment ? (
              <button type="button" className="crumb-link" onClick={() => go('cart')}>{s.label}</button>
            ) : (
              <span>{state === 'done' && <span className="sr-only">Klart: </span>}{s.label}</span>
            )}
            {n < STEPS.length && (
              <svg className="crumb-sep" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
            )}
          </li>
        )
      })}
    </ol>
  )

  if (payment || step !== 'cart') {
    const formId = payment ? 'order-pay' : 'order-checkout'
    const title = payment ? 'Betala' : STEP_TITLE[step]
    const ctaDisabled = payment ? !payStatus.ready || payStatus.busy : !open || busy || tooLarge
    const cta = payment
      ? payStatus.busy ? <><span className="spinner" aria-hidden="true" />Betalar…</> : `Betala ${kronor(payTotal)}`
      : step === 'confirm'
        ? busy ? <><span className="spinner" aria-hidden="true" />Skickar beställningen…</> : `Till betalning · ${kronor(total)}`
        : <>Fortsätt<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></>
    return (
      <div className="checkout" ref={headRef}>
        <header className="checkout-bar">
          <span className="checkout-brand">
            {config.tenant.branding.logoUrl && <img src={config.tenant.branding.logoUrl} alt="" width={32} height={32} />}
            <span>{config.tenant.name}</span>
          </span>
          {crumbs}
        </header>

        <details className="checkout-peek">
          <summary>
            <span>Visa beställning</span>
            <strong>{kronor(payTotal)}</strong>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </summary>
          <div className="checkout-peek-body">{summary}</div>
        </details>

        <div className="checkout-grid">
          <div className="checkout-main">
            <h1 className="checkout-title" ref={titleRef} tabIndex={-1}>{title}</h1>

            {payment ? (
              <>
                <section className="checkout-block" aria-labelledby="checkout-who">
                  <h2 id="checkout-who" className="checkout-sub">Dina uppgifter</h2>
                  <div className="checkout-card checkout-card--facts">
                    <p className="checkout-fact-strong">{guest.name}</p>
                    <p>{guest.phone} · {guest.email}</p>
                    <p>{place}</p>
                  </div>
                </section>
                <section className="checkout-block" aria-labelledby="checkout-pay">
                  <h2 id="checkout-pay" className="checkout-sub">Betala med</h2>
                  <PaymentPanel
                    publishableKey={config.stripe.publishableKey}
                    stripeAccount={payment.stripeAccount}
                    clientSecret={payment.clientSecret}
                    formId={formId}
                    onStatus={setPayStatus}
                    onPaid={paid}
                    onBack={back}
                    backLabel="Ändra beställningen"
                  />
                  <SecureNote>
                    Betalningen sker hos Stripe. Kortuppgifterna går direkt dit och sparas aldrig hos oss. Med Swish
                    eller Klarna kan du skickas vidare en kort stund för att godkänna.
                  </SecureNote>
                </section>
                <button type="button" className="checkout-back" disabled={payStatus.busy || payStatus.paid} onClick={back}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                  Ändra beställningen
                </button>
              </>
            ) : (
              <form id={formId} className="checkout-form" onSubmit={next} noValidate aria-busy={busy || undefined}>
                <div className="checkout-card checkout-step" key={step}>
                  {step === 'who' && (
                    <>
                      <label className="booking-field">
                        <span>Namn</span>
                        <input autoComplete="name" value={guest.name}
                          onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
                      </label>
                      <label className="booking-field">
                        <span>Mobilnummer</span>
                        <span className="field-hint">
                          {mode === 'pickup' ? 'Vi sms:ar när maten lagas och när den är klar.' : 'Vi sms:ar när maten lagas.'}
                        </span>
                        <PhoneInput value={guest.phone} onChange={(phone) => setGuest({ ...guest, phone })} />
                      </label>
                    </>
                  )}

                  {step === 'receipt' && (
                    <>
                      <label className="booking-field">
                        <span>E-post</span>
                        <span className="field-hint">Hit skickar vi kvittot.</span>
                        <input type="email" autoComplete="email" value={guest.email}
                          onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
                      </label>
                      <label className="booking-field">
                        <span>Allergier eller önskemål</span>
                        <span className="field-hint">Valfritt, till exempel nötallergi.</span>
                        <textarea rows={3} maxLength={NOTES_MAX} value={guest.notes}
                          onChange={(e) => setGuest({ ...guest, notes: e.target.value })} />
                      </label>
                    </>
                  )}

                  {step === 'confirm' && (
                    <fieldset className="order-fields" disabled={busy}>
                      <legend className="sr-only">{STEP_TITLE.confirm}</legend>
                      <label className="booking-check">
                        <input type="checkbox" checked={guest.accept}
                          onChange={(e) => setGuest({ ...guest, accept: e.target.checked })} />
                        <span>
                          Jag förstår att beställningen inte kan ändras efter betalning. Avbryter restaurangen får
                          jag pengarna tillbaka.
                        </span>
                      </label>
                      <MarketingConsent value={guest.consent} onChange={(consent) => setGuest({ ...guest, consent })} />
                      <details className="checkout-privacy">
                        <summary>
                          Vi använder namn, mobil och e-post till beställningen och kvittot.{' '}
                          <span className="checkout-privacy-more">Läs mer</span>
                        </summary>
                        <GuestDataNotice kind="order" />
                      </details>
                      {turnstileSiteKey && (
                        <TurnstileWidget siteKey={turnstileSiteKey} resetKey={turnstileReset} action="order"
                          onToken={setTurnstileToken} />
                      )}
                    </fieldset>
                  )}
                </div>

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

                <button type="button" className="checkout-back" disabled={busy} onClick={previous}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                  Tillbaka
                </button>
              </form>
            )}
          </div>

          <aside className="checkout-side" aria-label="Din beställning">
            <div className="checkout-side-sum">
              <h2 className="checkout-sub">Din beställning</h2>
              {summary}
            </div>
            {!payStatus.paid && (
              <div className="checkout-cta">
                <button type="submit" form={formId} disabled={ctaDisabled}
                  className={`btn-primary checkout-next${busy || payStatus.busy ? ' is-busy' : ''}`}>
                  {cta}
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    )
  }

  return (
    <>
      <section className="page-head" ref={headRef}>
        <h1>{mode === 'table' ? 'Beställ till bordet' : 'Beställ för avhämtning'}</h1>
        <p className="page-lede">
          {mode === 'table'
            ? `Välj, betala i mobilen - vi serverar vid ${tableLabel ? (/^bord/i.test(tableLabel) ? tableLabel : `bord ${tableLabel}`) : 'ditt bord'}.`
            : `Välj, betala här och hämta hos ${config.tenant.name}. Du får ett sms när maten är klar.`}
        </p>
        {crumbs}
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

        <aside className="order-cart" id="order-cart" ref={cartRef} aria-label="Din beställning">
          <div className="tray-head">
            <h2 className="checkout-title" ref={titleRef} tabIndex={-1}>{STEP_TITLE.cart}</h2>
            <span className="tray-plates" aria-hidden="true" ref={trayRef}>
              {lines.slice(0, 5).map(({ dish }) => (
                <Plate key={dish.menuItemId} src={menuImageUrl(dish.imageKey)} name={dish.name} size="sm" />
              ))}
            </span>
          </div>

          {lines.length === 0 ? (
            <p className="cart-empty">Brickan är tom. Tryck på + vid en rätt, så hamnar den här.</p>
          ) : (
          <form className="order-form" onSubmit={next} noValidate>
            <div className="checkout-step">
                <ul className="cart-list">
                  {lines.map(({ dish, quantity }) => (
                    <li key={dish.menuItemId}>
                      <span className="cart-item-name" key={quantity}>{quantity}&nbsp;×&nbsp;{dish.name}</span>
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
                {applied && (
                  <div className="cart-discount">
                    <span>Rabatt {applied.percent} % ({applied.code})</span>
                    <span>-{kronor(subtotal - total)}</span>
                  </div>
                )}
                <div className="cart-total">
                  <span>Totalt</span>
                  <span>
                    {applied && <s className="cart-total-before">{kronor(subtotal)}</s>} {kronor(total)}
                  </span>
                </div>
                <p className="cart-note">Priserna inkluderar moms.</p>
                {marketing && (
                  <div className="cart-code">
                    {!codeOpen && !code ? (
                      <button type="button" className="link-button" onClick={() => setCodeOpen(true)}>
                        Har du en rabattkod?
                      </button>
                    ) : code ? (
                      <p className="cart-code-ok" role="status">
                        {belowMin
                          ? `Koden gäller från ${kronor(code.minOrderOre)}. Lägg till för ${kronor(code.minOrderOre - subtotal)} till.`
                          : `Koden ${code.code} ger ${code.percent} % rabatt.`}{' '}
                        <button type="button" className="link-button" onClick={() => { setCode(null); setCodeInput('') }}>
                          Ta bort
                        </button>
                      </p>
                    ) : (
                      <div className="cart-code-row">
                        <label className="sr-only" htmlFor="order-code">Rabattkod</label>
                        <input id="order-code" autoComplete="off" autoCapitalize="characters" placeholder="ABCD-EFGH"
                          value={codeInput} maxLength={12} onChange={(e) => setCodeInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCode() } }} />
                        <button type="button" className="btn-secondary" disabled={codeBusy || !codeInput.trim()}
                          onClick={() => void applyCode()}>
                          {codeBusy ? 'Kollar…' : 'Använd'}
                        </button>
                      </div>
                    )}
                    {codeError && <p className="field-hint error" role="alert">{codeError}</p>}
                  </div>
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
            </div>
            <div className="checkout-actions">
              <button type="submit" className="btn-primary checkout-next" disabled={!open || tooLarge}>
                Fortsätt
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </form>
          )}
        </aside>
      </div>

      {lines.length > 0 && (
        <a className={`order-mobile-bar${cartInView ? ' is-hidden' : ''}`} href="#order-cart" ref={barRef}
          aria-hidden={cartInView || undefined} tabIndex={cartInView ? -1 : undefined}>
          <span className="order-mobile-bar-count" key={count}>{count}</span>
          <strong>Visa beställning</strong>
          <span className="order-mobile-bar-total">{kronor(total)}</span>
        </a>
      )}
    </>
  )
}
