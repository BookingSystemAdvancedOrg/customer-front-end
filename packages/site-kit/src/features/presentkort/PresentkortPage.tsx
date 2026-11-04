import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useSite } from '../../shared/SiteContext'
import { useTheme } from '../../shared/theme'
import { paymentAppearance, paymentFonts } from '../../shared/payment/appearance'
import { SecureNote } from '../../shared/payment/PaymentTicket'
import { stripeFor } from '../../shared/payment/stripe'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import {
  getOffer,
  giftErrorMessage,
  kr,
  newPurchaseId,
  rememberPurchase,
  rememberedPurchase,
  startCheckout,
  type Checkout,
  type Offer,
} from './giftApi'

type Paid = 'succeeded' | 'processing'

/**
 * Efter 3-D Secure skickar Stripe tillbaka hit med `redirect_status`
 * (succeeded, processing eller failed). Tack-sidan visas bara när Stripe säger
 * att betalningen gick igenom eller behandlas, aldrig bara för att `?klart=1` finns.
 */
function returnedFromStripe(): { paid: Paid | null; failed: boolean } {
  if (typeof window === 'undefined') return { paid: null, failed: false }
  const params = new URLSearchParams(window.location.search)
  if (params.get('klart') !== '1') return { paid: null, failed: false }
  const status = params.get('redirect_status')
  if (status === 'succeeded' || status === 'processing') return { paid: status, failed: false }
  return { paid: null, failed: true }
}

/** /presentkort: välj belopp, fyll i, betala. Koden kommer via e-post när Stripe har bekräftat betalningen. */
export default function PresentkortPage() {
  const { config, location } = useSite()
  const [offer, setOffer] = useState<Offer | null>(null)
  const [missing, setMissing] = useState(false)
  const [checkout, setCheckout] = useState<Checkout | null>(null)
  const [returned] = useState(returnedFromStripe)
  const [paid, setPaid] = useState<Paid | null>(returned.paid)

  useEffect(() => {
    getOffer(location.locationId)
      .then((o) => (Array.isArray(o?.amountsSek) ? setOffer(o) : setMissing(true)))
      .catch(() => setMissing(true))
  }, [location.locationId])

  useEffect(() => {
    if (!returned.failed) return
    // Ta bort Stripes parametrar så att en omladdning inte visar felet igen.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`)
  }, [returned.failed])

  if (paid) return <ThankYou status={paid} />
  if (missing || !config.tenant.features?.giftCards) {
    return (
      <section className="page-hero page-prose">
        <h1>Presentkort</h1>
        <p>{config.tenant.name} säljer inga presentkort på hemsidan just nu.</p>
      </section>
    )
  }
  if (!offer) return <section className="page-hero page-prose"><h1>Presentkort</h1><p className="cell-muted">Hämtar…</p></section>

  return (
    <section className="page-hero page-prose">
      <h1>Presentkort</h1>
      {returned.failed && !checkout ? (
        <p className="notice error" role="alert">Betalningen gick inte igenom och inget har dragits. Försök igen, gärna med ett annat kort.</p>
      ) : null}
      <p>Ge bort en middag hos {config.tenant.name}. Presentkortet gäller i {offer.validityMonths} månader och kan
        användas både i restaurangen och när man beställer här på hemsidan.</p>
      {checkout ? (
        <PayStep checkout={checkout} onPaid={setPaid} />
      ) : (
        <Details offer={offer} onCheckout={setCheckout} />
      )}
      <p><Link to="/presentkort/saldo">Se saldot på ett presentkort</Link></p>
    </section>
  )
}

function Details({ offer, onCheckout }: { offer: Offer; onCheckout: (c: Checkout) => void }) {
  const { config, location } = useSite()
  const [purchaseId] = useState(newPurchaseId)
  const [amount, setAmount] = useState<number>(offer.amountsSek[0] ?? offer.customMinSek)
  const [custom, setCustom] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const siteKey = config.turnstile?.siteKey ?? null
  const chosen = custom ? Number(custom) : amount

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const out = await startCheckout(location.locationId, {
        purchaseId, amountSek: chosen, buyerEmail: buyerEmail.trim(),
        ...(recipientName.trim() ? { recipientName: recipientName.trim() } : {}),
        ...(recipientEmail.trim() ? { recipientEmail: recipientEmail.trim() } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(turnstileToken ? { turnstileToken } : {}),
      })
      rememberPurchase({ purchaseId, amountSek: out.amountSek, expiresAt: out.expiresAt })
      onCheckout(out)
    } catch (err) {
      setError(giftErrorMessage(err, 'Det gick inte att starta köpet. Försök igen.'))
      setTurnstileReset((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  const customOk = !custom || (chosen >= offer.customMinSek && chosen <= offer.customMaxSek && Number.isInteger(chosen))
  return (
    <form onSubmit={submit} noValidate>
      <div className="booking-times" role="group" aria-label="Välj belopp">
        {offer.amountsSek.map((a) => (
          <button key={a} type="button" className={`filter-pill${!custom && a === amount ? ' active' : ''}`}
            aria-pressed={!custom && a === amount} onClick={() => { setAmount(a); setCustom('') }}>
            {kr(a)}
          </button>
        ))}
      </div>
      <div className="booking-grid">
        <label className="booking-field">
          <span>Eget belopp ({offer.customMinSek}-{offer.customMaxSek} kr)</span>
          <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="booking-field">
          <span>Din e-post (kvitto{recipientEmail ? '' : ' och koden'})</span>
          <input type="email" autoComplete="email" required value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
        </label>
        <label className="booking-field">
          <span>Mottagarens namn (valfritt)</span>
          <input maxLength={80} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </label>
        <label className="booking-field">
          <span>Mottagarens e-post (valfritt, koden skickas dit)</span>
          <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
        </label>
        <label className="booking-field booking-field--wide">
          <span>Hälsning (valfritt)</span>
          <textarea maxLength={300} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
      </div>
      <p className="guest-notice">
        Vi använder e-postadresserna för att skicka presentkortet och kvittot. Kontaktuppgifterna tas bort 24 månader
        efter att kortet har använts eller gått ut; beloppen sparas i 7 år enligt bokföringslagen.{' '}
        {config.tenant.name} är personuppgiftsansvarig.{' '}
        <Link to="/integritetspolicy" target="_blank" rel="noopener">Läs integritetspolicyn</Link>
      </p>
      {siteKey ? <TurnstileWidget siteKey={siteKey} resetKey={turnstileReset} onToken={setTurnstileToken} /> : null}
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button type="submit" className="btn-primary" aria-busy={busy}
        disabled={busy || !buyerEmail.trim() || !customOk || Boolean(siteKey && !turnstileToken)}>
        {busy ? 'Startar…' : `Till betalning, ${kr(chosen || 0)}`}
      </button>
    </form>
  )
}

function PayStep({ checkout, onPaid }: { checkout: Checkout; onPaid: (status: Paid) => void }) {
  const { config } = useSite()
  const publishableKey = config.stripe?.publishableKey ?? null
  const stripePromise = useMemo(
    () => (publishableKey ? stripeFor(publishableKey, checkout.stripeAccount) : null),
    [publishableKey, checkout.stripeAccount],
  )
  const { theme } = useTheme()
  const fonts = useMemo(() => paymentFonts(), [])
  const appearance = useMemo(() => paymentAppearance(theme), [theme])
  if (!stripePromise) {
    return <p className="notice error" role="alert">Kortbetalningen är inte tillgänglig just nu.</p>
  }
  return (
    <>
      <Elements key={theme} stripe={stripePromise} options={{ clientSecret: checkout.clientSecret, appearance, fonts, loader: 'never' }}>
        <PayForm amountSek={checkout.amountSek} onPaid={onPaid} />
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
    const returnUrl = `${window.location.origin}${window.location.pathname}?klart=1${window.location.hash}`
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
    if (result.error) {
      setError(result.error.message ?? 'Betalningen gick inte igenom. Försök igen.')
      setBusy(false)
      return
    }
    const status = result.paymentIntent?.status
    if (status === 'succeeded' || status === 'processing') {
      onPaid(status)
      return
    }
    setError('Betalningen gick inte igenom. Försök igen, gärna med ett annat kort.')
    setBusy(false)
  }

  return (
    <form onSubmit={pay} aria-busy={busy || undefined}>
      <PaymentElement options={{ layout: { type: 'tabs' }, wallets: { link: 'never' } }} />
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button type="submit" className="btn-primary" disabled={!stripe || busy}>
        {busy ? 'Betalar…' : `Betala ${kr(amountSek)}`}
      </button>
    </form>
  )
}

function ThankYou({ status }: { status: Paid }) {
  const purchase = rememberedPurchase()
  useEffect(() => () => rememberPurchase(null), [])
  return (
    <section className="page-hero page-prose" aria-live="polite">
      <h1>Tack för köpet!</h1>
      <p>
        {purchase ? `Presentkortet på ${kr(purchase.amountSek)} ` : 'Presentkortet '}
        {status === 'processing' ? 'behandlas av banken. Koden kommer via e-post så snart betalningen är klar' : 'är betalt. Koden kommer via e-post inom några minuter'}
        {purchase ? ` och gäller till och med ${purchase.expiresAt.slice(0, 10)}` : ''}.
      </p>
      <p className="cell-muted">Hittar du inte mejlet? Titta i skräpposten. Den som har koden kan använda presentkortet.</p>
    </section>
  )
}
