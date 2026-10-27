import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout'
import { Celebrate } from '../Celebrate'
import { useTheme } from '../theme'
import { paymentAppearance, paymentFonts } from './appearance'
import { stripeFor } from './stripe'

/**
 * Betalningen på sajtens egen sida: ett kvitto som skrivs ut, Stripes
 * Payment Element (kort, Apple Pay/Google Pay, Swish, Klarna - det
 * restaurangens konto har) i sajtens tryck, och betala-knappen. Bakom
 * ligger en Checkout Session (ui_mode "elements") på restaurangens
 * Stripe-konto; samma session och webhookar som Stripes egna sida.
 *
 * Kortuppgifterna stannar i Stripes iframes och passerar aldrig vår kod
 * eller server (PCI SAQ A). Swish, Klarna och 3-D Secure som kräver en
 * omdirigering kommer tillbaka till sessionens return_url (status- eller
 * förfrågningssidan); allt annat bekräftas här och avslutas med en stämpel.
 */

/** Så länge utskriften får pågå innan sidan säger att något inte laddar. */
const SLOW_MS = 20_000
/** Stämpeln och pappersregnet hinner synas innan gästen skickas vidare. */
const STAMP_MS = 1_200

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Remsan som skrivs ut medan Stripe laddar (sajtens laddningsmönster). */
export function PaymentPrinting({ label = 'Skriver ut betalningen' }: { label?: string }) {
  return (
    <div className="printing printing--inline pay-printing" role="status" aria-label={label}>
      <span className="printing__label">{label}</span>
      <i /><i /><i />
    </div>
  )
}

/** Stämpeln när betalningen gick igenom. */
export function PaidStamp({ text, next }: { text: string; next?: string }) {
  return (
    <div className="pay-done" role="status">
      <Celebrate />
      <p className="booking-status stamp-ok pay-stamp">{text}</p>
      {next && <p className="cell-muted">{next}</p>}
    </div>
  )
}

export function SecureNote({ children }: { children?: ReactNode }) {
  return (
    <p className="pay-secure">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3" y="7" width="10" height="7" rx="1" />
        <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      </svg>
      <span>{children ?? 'Betalningen sker hos Stripe. Kortuppgifterna går direkt dit och sparas aldrig hos oss.'}</span>
    </p>
  )
}

/** Läget för en betalknapp som ritas utanför formuläret (PaymentPanel). */
export interface PayStatus {
  ready: boolean
  busy: boolean
  paid: boolean
}

function CheckoutForm({
  payLabel,
  onPaid,
  onBack,
  backLabel,
  formId,
  onStatus,
}: {
  payLabel: string
  onPaid: () => void
  onBack?: () => void
  backLabel: string
  /** Knappen ligger utanför (form={formId}); formuläret ritar ingen egen. */
  formId?: string
  onStatus?: (status: PayStatus) => void
}) {
  const state = useCheckoutElements()
  const [ready, setReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [slow, setSlow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    if (ready) return
    const t = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => window.clearTimeout(t)
  }, [ready])

  useEffect(() => {
    onStatus?.({ ready: ready && state.type === 'success' && !loadFailed, busy, paid })
  }, [onStatus, ready, busy, paid, state.type, loadFailed])

  useEffect(() => {
    if (!paid) return
    const t = window.setTimeout(onPaid, reducedMotion() ? 0 : STAMP_MS)
    return () => window.clearTimeout(t)
  }, [paid, onPaid])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (state.type !== 'success' || busy || paid) return
    setBusy(true)
    setError(null)
    try {
      const result = await state.checkout.confirm({ redirect: 'if_required' })
      if (result.type === 'error') {
        setError(result.error.message || 'Betalningen gick inte igenom. Försök igen eller välj ett annat sätt.')
        setBusy(false)
        return
      }
      setPaid(true)
    } catch {
      setError('Betalningen kunde inte skickas. Kontrollera anslutningen och försök igen.')
      setBusy(false)
    }
  }

  if (state.type === 'error' || loadFailed) {
    return (
      <>
        <p className="notice error" role="alert">
          Betalningen kunde inte startas. Gå tillbaka och försök igen om en liten stund.
        </p>
        {onBack && (
          <button type="button" className="btn-secondary" onClick={onBack}>
            {backLabel}
          </button>
        )}
      </>
    )
  }

  if (paid) return <PaidStamp text="Betalt" next="Skickar dig vidare…" />

  return (
    <form className="pay-form" id={formId} onSubmit={submit} noValidate aria-busy={busy || undefined}>
      {!ready && <PaymentPrinting />}
      {!ready && slow && (
        <p className="notice" role="status">
          Betalningen tar ovanligt lång tid att ladda. Kontrollera anslutningen, eller ladda om sidan.
        </p>
      )}
      <div className={`pay-element${ready ? ' is-ready' : ''}`}>
        <PaymentElement
          onReady={() => setReady(true)}
          onLoadError={() => setLoadFailed(true)}
          options={{ layout: { type: 'tabs' }, wallets: { link: 'never' } }}
        />
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="notice is-ok" role="status">
          Betalningen bekräftas. Det tar bara en liten stund - stäng inte sidan.
        </p>
      )}
      {!formId && <div className="pay-actions">
        <button
          type="submit"
          className={`btn-primary pay-submit${busy ? ' is-busy' : ''}`}
          disabled={state.type !== 'success' || !ready || busy}
        >
          {busy ? <><span className="spinner" aria-hidden="true" />Betalar…</> : payLabel}
        </button>
        {onBack && (
          <button type="button" className="link-button pay-back" disabled={busy} onClick={onBack}>
            {backLabel}
          </button>
        )}
      </div>}
    </form>
  )
}

function useCheckoutOptions(publishableKey: string | null, stripeAccount: string, clientSecret: string) {
  const { theme } = useTheme()
  const stripePromise = useMemo(
    () => (publishableKey ? stripeFor(publishableKey, stripeAccount) : null),
    [publishableKey, stripeAccount],
  )
  const fonts = useMemo(() => paymentFonts(), [])
  const options = useMemo(
    () => ({
      clientSecret,
      elementsOptions: { appearance: paymentAppearance(theme), fonts, loader: 'never' as const },
    }),
    [clientSecret, theme, fonts],
  )
  return { theme, stripePromise, options }
}

/**
 * Bara Stripes formulär, utan kvitto och utan egen knapp: kassan på
 * beställningssidan ritar betalknappen i sammanfattningen (form={formId})
 * och får formulärets läge via onStatus.
 */
export function PaymentPanel({
  publishableKey,
  stripeAccount,
  clientSecret,
  formId,
  onStatus,
  onPaid,
  onBack,
  backLabel = 'Tillbaka',
}: {
  publishableKey: string | null
  stripeAccount: string
  clientSecret: string
  formId: string
  onStatus: (status: PayStatus) => void
  onPaid: () => void
  onBack?: () => void
  backLabel?: string
}) {
  const { theme, stripePromise, options } = useCheckoutOptions(publishableKey, stripeAccount, clientSecret)
  if (!stripePromise) {
    return (
      <p className="notice error" role="alert">
        Betalningen är inte tillgänglig just nu. Ring restaurangen.
      </p>
    )
  }
  return (
    <CheckoutElementsProvider key={theme} stripe={stripePromise} options={options}>
      <CheckoutForm payLabel="" onPaid={onPaid} onBack={onBack} backLabel={backLabel} formId={formId} onStatus={onStatus} />
    </CheckoutElementsProvider>
  )
}

/**
 * Betalningskvittot för en Checkout Session (beställning, catering).
 * `summary` är det som betalas (rader och totalsumma) överst på kvittot.
 */
export function PaymentTicket({
  publishableKey,
  stripeAccount,
  clientSecret,
  title = 'Betala',
  summary,
  payLabel,
  onPaid,
  onBack,
  backLabel = 'Tillbaka',
}: {
  publishableKey: string | null
  stripeAccount: string
  clientSecret: string
  title?: string
  summary?: ReactNode
  payLabel: string
  onPaid: () => void
  onBack?: () => void
  backLabel?: string
}) {
  const { theme, stripePromise, options } = useCheckoutOptions(publishableKey, stripeAccount, clientSecret)

  return (
    <section className="pay-ticket" aria-labelledby="pay-title">
      <p className="summary-kicker">Betalning</p>
      <h2 id="pay-title">{title}</h2>
      {summary && <div className="pay-summary">{summary}</div>}
      {stripePromise ? (
        // key: Stripe tar inte till sig ett nytt utseende i ett öppet formulär
        // (ljust/mörkt bytt mitt i), så det ritas om. Ett halvskrivet kort
        // töms då - hellre det än ett formulär i fel läge.
        <CheckoutElementsProvider key={theme} stripe={stripePromise} options={options}>
          <CheckoutForm payLabel={payLabel} onPaid={onPaid} onBack={onBack} backLabel={backLabel} />
        </CheckoutElementsProvider>
      ) : (
        <p className="notice error" role="alert">
          Betalningen är inte tillgänglig just nu. Ring restaurangen.
        </p>
      )}
      <SecureNote />
    </section>
  )
}
