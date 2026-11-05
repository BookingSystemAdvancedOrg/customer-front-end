import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bar, Button, Chip, Field, Input } from '@booqy/brand'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import './evenemang.css'
import { useSite } from '../../shared/SiteContext'
import { useTheme } from '../../shared/theme'
import { paymentAppearance, paymentFonts } from '../../shared/payment/appearance'
import { SecureNote } from '../../shared/payment/PaymentTicket'
import { stripeFor } from '../../shared/payment/stripe'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import {
  checkout,
  clampQty,
  codeOf,
  eventsErrorMessage,
  getEvent,
  isNotFound,
  isPublicEvent,
  kr,
  maxFor,
  newId,
  rememberPurchase,
  rememberedPurchase,
  time,
  when,
  type PublicEvent,
  type PublicOccurrence,
  type TicketCheckout,
} from './eventsApi'

type Paid = 'succeeded' | 'processing' | 'free'
type Load = { kind: 'loading' } | { kind: 'ready'; event: PublicEvent } | { kind: 'missing' } | { kind: 'error' }

/**
 * Efter 3-D Secure skickar Stripe tillbaka hit med `redirect_status`. Tack-
 * sidan visas bara när Stripe säger att betalningen gick igenom eller
 * behandlas, aldrig bara för att `?klart=1` finns.
 */
function returnedFromStripe(): { paid: Paid | null; failed: boolean } {
  if (typeof window === 'undefined') return { paid: null, failed: false }
  const params = new URLSearchParams(window.location.search)
  if (params.get('klart') !== '1') return { paid: null, failed: false }
  const status = params.get('redirect_status')
  if (status === 'succeeded' || status === 'processing') return { paid: status, failed: false }
  return { paid: null, failed: true }
}

/**
 * /evenemang/:eventId: läs om evenemanget, välj datum och biljetter, fyll i
 * namn och e-post, betala med kort (Stripe på restaurangens konto) och få
 * biljetterna via e-post. Platserna hålls i 15 minuter från "Till
 * betalning". Biljetterna utfärdas först när Stripe har bekräftat
 * betalningen (webhook), därför visar tack-sidan inga QR-koder: de finns på
 * biljettsidan som mejlet länkar till. Gratisbiljetter skickas direkt.
 */
export default function EvenemangDetaljPage() {
  const { eventId = '' } = useParams()
  const { location } = useSite()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [returned] = useState(returnedFromStripe)
  const [paid, setPaid] = useState<Paid | null>(returned.paid)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let live = true
    getEvent(location.locationId, eventId)
      .then((ev) => live && setLoad(isPublicEvent(ev) ? { kind: 'ready', event: ev } : { kind: 'missing' }))
      .catch((err) => live && setLoad(isNotFound(err) ? { kind: 'missing' } : { kind: 'error' }))
    return () => {
      live = false
    }
  }, [location.locationId, eventId, reloadKey])

  useEffect(() => {
    if (!returned.failed) return
    // Ta bort Stripes parametrar så att en omladdning inte visar felet igen.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`)
  }, [returned.failed])

  const reload = useCallback(() => setReloadKey((n) => n + 1), [])

  if (paid) return <ThankYou status={paid} />
  if (load.kind !== 'ready') {
    return (
      <section className="page-hero page-prose evenemang-page" data-bq-theme="restaurant">
        <h1>Evenemang</h1>
        {load.kind === 'loading' ? <p className="cell-muted" role="status">Hämtar evenemanget…</p> : null}
        {load.kind === 'missing' ? <p>Evenemanget finns inte eller säljs inte längre här.</p> : null}
        {load.kind === 'error' ? (
          <Bar variant="banner" tone="danger">Evenemanget gick inte att hämta just nu. Ladda om sidan om en stund.</Bar>
        ) : null}
        <p><Link to="/evenemang">Alla evenemang</Link></p>
      </section>
    )
  }
  const ev = load.event
  return (
    <section className="page-hero page-prose evenemang-page" data-bq-theme="restaurant">
      <p className="hero-kicker"><Link to="/evenemang">Alla evenemang</Link></p>
      <h1>{ev.title}</h1>
      {ev.description ? <p className="evenemang-description">{ev.description}</p> : null}
      {returned.failed ? (
        <Bar variant="banner" tone="danger">Betalningen gick inte igenom och inget har dragits. Försök igen, gärna med ett annat kort.</Bar>
      ) : null}
      <Purchase event={ev} onPaid={setPaid} onStale={reload} />
      {ev.refundPolicy ? (
        <>
          <h2>Återbetalning</h2>
          <p>{ev.refundPolicy}</p>
        </>
      ) : null}
    </section>
  )
}

function occurrenceText(o: PublicOccurrence, tz?: string | null): string {
  const end = o.endAt ? `-${time(o.endAt, tz)}` : ''
  return `${when(o.startAt, tz)}${end}`
}

function occurrenceStatus(o: PublicOccurrence): string {
  if (o.soldOut) return 'Slutsålt'
  if (o.salesOpen === false) return 'Försäljningen är stängd'
  return o.left <= 10 ? `${o.left} platser kvar` : 'Biljetter finns'
}

const bookable = (o: PublicOccurrence) => !o.soldOut && o.salesOpen !== false && o.left > 0

function Purchase({ event, onPaid, onStale }: { event: PublicEvent; onPaid: (p: Paid) => void; onStale: () => void }) {
  const { config, location } = useSite()
  const tz = location.timezone
  const firstOpen = event.occurrences.find(bookable)
  const [occurrenceId, setOccurrenceId] = useState(firstOpen?.occurrenceId ?? '')
  const [chosen, setQty] = useState<Record<string, number>>({})
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [orderId, setOrderId] = useState(newId)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [held, setHeld] = useState<TicketCheckout | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const siteKey = config.turnstile?.siteKey ?? null

  const occurrence = event.occurrences.find((o) => o.occurrenceId === occurrenceId)
  // Efter en omladdning (sold_out, changed_retry) kan färre platser finnas: valet hålls inom dem.
  const qty = clampQty(chosen, event.ticketTypes, occurrence, event.perOrderMax)
  const total = Object.values(qty).reduce((a, b) => a + b, 0)
  const amountSek = event.ticketTypes.reduce((sum, t) => sum + (qty[t.typeId] ?? 0) * t.priceSek, 0)
  const lines = event.ticketTypes.filter((t) => (qty[t.typeId] ?? 0) > 0).map((t) => ({ typeId: t.typeId, qty: qty[t.typeId] }))

  // Ett nytt val är en ny beställning (servern svarar changed_retry på samma id med andra rader).
  const change = (fn: () => void) => {
    fn()
    setOrderId(newId())
    setError(null)
  }

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  if (!event.occurrences.length) {
    return <p>Det finns inga kommande tillfällen just nu.</p>
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!occurrence || !lines.length || busy) return
    setBusy(true)
    setError(null)
    try {
      const out = await checkout(location.locationId, {
        orderId, occurrenceId, lines, buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim(),
        ...(buyerPhone.trim() ? { buyerPhone: buyerPhone.trim() } : {}),
        ...(turnstileToken ? { turnstileToken } : {}),
      })
      if (!out.clientSecret) {
        onPaid('free')
        return
      }
      rememberPurchase({ orderId, eventId: event.eventId, title: event.title, amountSek: out.amountSek, qty: total })
      setHeld(out)
    } catch (err) {
      setError(eventsErrorMessage(err, 'Det gick inte att starta köpet. Försök igen.'))
      setTurnstileReset((n) => n + 1)
      const code = codeOf(err)
      if (code && ['sold_out', 'type_sold_out', 'sales_closed', 'changed_retry'].includes(code)) {
        setOrderId(newId())
        onStale()
      }
    } finally {
      setBusy(false)
    }
  }

  if (held && held.clientSecret) {
    return (
      <div className="evenemang-pay">
        <h2>Betala</h2>
        <p>
          {`${total} ${total === 1 ? 'biljett' : 'biljetter'}, ${occurrence ? occurrenceText(occurrence, tz) : ''}. `}
          {`Platserna hålls till kl. ${time(held.expiresAt, tz)}.`}
        </p>
        <PayStep checkout={held} onPaid={onPaid} />
        <Button variant="ghost" onClick={() => {
          setHeld(null); setOrderId(newId()); rememberPurchase(null)
          // En Turnstile-token gäller en gång: en ny kontroll innan nästa försök.
          setTurnstileToken(null); setTurnstileReset((n) => n + 1)
        }}>
          Ändra biljetterna
        </Button>
      </div>
    )
  }

  const canBuy = Boolean(occurrence && bookable(occurrence) && total > 0 && buyerName.trim() && buyerEmail.trim()
    && (!siteKey || turnstileToken))
  return (
    <form onSubmit={submit} noValidate className="evenemang-form">
      <fieldset className="evenemang-fieldset">
        <legend>{event.occurrences.length > 1 ? 'Välj datum' : 'Datum'}</legend>
        <div className="evenemang-dates">
          {event.occurrences.map((o) => {
            const open = bookable(o)
            return (
              <label key={o.occurrenceId} className={`evenemang-date${open ? '' : ' is-closed'}`}>
                <input type="radio" name="occurrence" value={o.occurrenceId} disabled={!open}
                  checked={occurrenceId === o.occurrenceId}
                  onChange={() => change(() => { setOccurrenceId(o.occurrenceId); setQty({}) })} />
                <span className="evenemang-date__when">{occurrenceText(o, tz)}</span>
                <span className="evenemang-date__left">{occurrenceStatus(o)}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="evenemang-fieldset" disabled={!occurrence || !bookable(occurrence)}>
        <legend>Biljetter</legend>
        <ul className="evenemang-types">
          {event.ticketTypes.map((t) => {
            const n = qty[t.typeId] ?? 0
            const max = maxFor(t, occurrence, event.perOrderMax, total - n)
            const id = `typ-${t.typeId}`
            return (
              <li key={t.typeId} className="evenemang-type">
                <div className="evenemang-type__info">
                  <span className="evenemang-type__name" id={`${id}-namn`}>{t.name}</span>
                  <span className="evenemang-type__price">{t.priceSek ? kr(t.priceSek) : 'Gratis'}</span>
                  {t.includes ? <span className="cell-muted">{t.includes}</span> : null}
                  {!t.available ? <Chip tone="warning">Slut</Chip> : null}
                </div>
                <div className="evenemang-qty" role="group" aria-labelledby={`${id}-namn`}>
                  <Button size="sm" aria-label={`En ${t.name} färre`} disabled={n === 0}
                    onClick={() => change(() => setQty((q) => ({ ...q, [t.typeId]: n - 1 })))}>−</Button>
                  <output className="evenemang-qty__n" aria-live="polite" aria-label={`Antal ${t.name}`}>{n}</output>
                  <Button size="sm" aria-label={`En ${t.name} till`} disabled={n >= max}
                    onClick={() => change(() => setQty((q) => ({ ...q, [t.typeId]: n + 1 })))}>+</Button>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="cell-muted">{`Högst ${event.perOrderMax} biljetter per beställning.`}</p>
      </fieldset>

      <fieldset className="evenemang-fieldset">
        <legend>Dina uppgifter</legend>
        <div className="evenemang-fields">
          <Field label="Namn" required>
            <Input autoComplete="name" maxLength={80} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </Field>
          <Field label="E-post" required hint="Biljetterna och kvittot skickas hit.">
            <Input type="email" autoComplete="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
          </Field>
          <Field label="Telefon (valfritt)">
            <Input type="tel" autoComplete="tel" maxLength={20} value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <p className="guest-notice">
        Vi använder ditt namn och din e-post för att skicka biljetterna och kvittot och för att släppa in dig. Namn och
        kontaktuppgifter tas bort 24 månader efter evenemanget; beloppen sparas i 7 år enligt bokföringslagen.{' '}
        {config.tenant.name} är personuppgiftsansvarig.{' '}
        <Link to="/integritetspolicy" target="_blank" rel="noopener">Läs integritetspolicyn</Link>
      </p>
      {siteKey ? <TurnstileWidget siteKey={siteKey} resetKey={turnstileReset} onToken={setTurnstileToken} /> : null}
      <div ref={errorRef} tabIndex={-1} className="evenemang-error">
        {error ? <Bar variant="banner" tone="danger">{error}</Bar> : null}
      </div>
      <p className="evenemang-total" aria-live="polite">{`Totalt ${kr(amountSek)}`}</p>
      <Button type="submit" variant="primary" busy={busy} busyLabel="Reserverar platser…" disabled={!canBuy}>
        {total === 0 ? 'Välj biljetter' : amountSek === 0 ? 'Hämta biljetterna' : `Till betalning, ${kr(amountSek)}`}
      </Button>
    </form>
  )
}

function PayStep({ checkout: held, onPaid }: { checkout: TicketCheckout; onPaid: (status: Paid) => void }) {
  const { config } = useSite()
  const publishableKey = config.stripe?.publishableKey ?? null
  const account = held.stripeAccount ?? config.stripe?.accountId ?? null
  const stripePromise = useMemo(
    () => (publishableKey && account ? stripeFor(publishableKey, account) : null),
    [publishableKey, account],
  )
  const { theme } = useTheme()
  const fonts = useMemo(() => paymentFonts(), [])
  const appearance = useMemo(() => paymentAppearance(theme), [theme])
  if (!stripePromise || !held.clientSecret) {
    return <Bar variant="banner" tone="danger">Kortbetalningen är inte tillgänglig just nu.</Bar>
  }
  return (
    <>
      <Elements key={theme} stripe={stripePromise} options={{ clientSecret: held.clientSecret, appearance, fonts, loader: 'never' }}>
        <PayForm amountSek={held.amountSek} onPaid={onPaid} />
      </Elements>
      <SecureNote>Kortuppgifterna går direkt till Stripe och sparas aldrig hos oss.</SecureNote>
    </>
  )
}

function PayForm({ amountSek, onPaid }: { amountSek: number; onPaid: (status: Paid) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay(e: FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true)
    setError(null)
    const returnUrl = `${window.location.origin}${window.location.pathname}?klart=1`
    try {
      const result = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
      if (result.error) {
        setError(result.error.message ?? 'Betalningen gick inte igenom. Försök igen.')
        return
      }
      const status = result.paymentIntent?.status
      if (status === 'succeeded' || status === 'processing') {
        onPaid(status)
        return
      }
      setError('Betalningen gick inte igenom. Försök igen, gärna med ett annat kort.')
    } catch {
      setError('Betalningen gick inte att slutföra. Kontrollera anslutningen och försök igen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={pay} aria-busy={busy || undefined} className="evenemang-form">
      <PaymentElement options={{ layout: { type: 'tabs' }, wallets: { link: 'never' } }} />
      {error ? <Bar variant="banner" tone="danger">{error}</Bar> : null}
      <Button type="submit" variant="primary" disabled={!stripe} busy={busy} busyLabel="Betalar…">
        {`Betala ${kr(amountSek)}`}
      </Button>
    </form>
  )
}

function ThankYou({ status }: { status: Paid }) {
  const [purchase] = useState(rememberedPurchase)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    return () => rememberPurchase(null)
  }, [])
  const what = purchase
    ? `${purchase.qty === 1 ? 'Biljetten' : `De ${purchase.qty} biljetterna`} till ${purchase.title}`
    : 'Biljetterna'
  return (
    <section className="page-hero page-prose evenemang-page" data-bq-theme="restaurant" aria-live="polite">
      <h1 ref={heading} tabIndex={-1}>{status === 'free' ? 'Klart!' : 'Tack för köpet!'}</h1>
      <p>
        {status === 'processing'
          ? `${what} behandlas av banken. Biljetterna kommer via e-post så snart betalningen är klar.`
          : status === 'free'
            ? `${what} är bokade och kommer via e-post om en liten stund.`
            : `${what} är betalda${purchase ? ` (${kr(purchase.amountSek)})` : ''}. Biljetterna kommer via e-post inom några minuter.`}
      </p>
      <p>Mejlet har en länk till biljettsidan med QR-koderna. Visa dem i dörren, på telefonen eller utskrivna.</p>
      <p className="cell-muted">Hittar du inte mejlet? Titta i skräpposten. Den som har länken kan visa biljetterna.</p>
      <p><Link to="/evenemang">Fler evenemang</Link></p>
    </section>
  )
}
