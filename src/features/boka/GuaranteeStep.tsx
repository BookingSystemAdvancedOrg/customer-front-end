import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useTheme } from '../../shared/theme'
import { paymentAppearance, paymentFonts } from '../../shared/payment/appearance'
import { PaymentPrinting, SecureNote } from '../../shared/payment/PaymentTicket'
import { stripeFor } from '../../shared/payment/stripe'
import { feeLines, formatDeadline, fromSnapshot, NOTHING_CHARGED, persons, WAIVER } from '../../shared/bookingTerms'
import type { GuaranteeTerms } from '../../shared/site'
import { bookingErrorMessage, confirmGuestReservation } from './bookingApi'
import type { GuestReservation } from './bookingApi'

/**
 * Kortgaranti: Stripes inbäddade kortformulär (Payment Element) på
 * restaurangens eget Stripe-konto. Inget dras nu - kortet sparas för en
 * eventuell avgift vid utebliven gäst eller sen avbokning, enligt villkoren
 * som visas här. 3-D Secure sker direkt i formuläret. När Stripe bekräftat
 * kortet bokar backend bordet (POST .../confirm).
 *
 * Kortuppgifterna går direkt från webbläsaren till Stripe i en iframe -
 * de passerar aldrig vår server.
 *
 * Stripe Link är avstängt här (wallets.link = 'never'): Link skickar en
 * sms-kod till numret på gästens Link-konto - inte till numret i
 * bokningen - vilket bara förvirrar när det enda som händer är att ett kort
 * sparas. Namn, e-post och telefon från bokningsformuläret fylls i hos
 * Stripe (defaultValues), så kortet och en eventuell 3-D Secure-kontroll
 * hör till samma person och nummer som bokningen.
 */

/** Gästens uppgifter från bokningsformuläret. */
export interface GuaranteeGuest {
  name: string
  email: string
  /** E.164 (+46701234567). */
  phone: string | null
}

function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60000))
}

/** Avgifterna och sista tiden för kostnadsfri avbokning från bokningens ögonblicksbild. */
export function GuaranteeTermsText({ booking }: { booking: GuestReservation }) {
  const g = booking.guarantee
  if (!g) return null
  const until = g.freeCancelUntil ? formatDeadline(g.freeCancelUntil, booking.timezone) : null
  return (
    <ul className="guarantee-terms">
      {booking.status === 'pending' && <li>{NOTHING_CHARGED}</li>}
      {feeLines(fromSnapshot(g, booking.partySize), booking.partySize, until).map((line) => <li key={line}>{line}</li>)}
      <li>{WAIVER}</li>
    </ul>
  )
}

/** Före bokningen: platsens villkor räknade för just det här sällskapet. */
export function GuaranteeNotice({ terms, partySize }: { terms: GuaranteeTerms; partySize: number }) {
  return (
    <div className="guarantee-notice" role="note">
      <strong>Kortgaranti krävs</strong>
      {terms.minPartySize > 1 ? ` för sällskap om ${persons(terms.minPartySize)} eller fler` : ''}. {NOTHING_CHARGED}
      <ul className="guarantee-terms">
        {feeLines(terms, partySize).map((line) => <li key={line}>{line}</li>)}
        <li>{WAIVER}</li>
      </ul>
    </div>
  )
}

/** Bekräftelsen: kortet är sparat, och vad som gäller för bokningen. */
export function GuaranteeConfirmation({ booking }: { booking: GuestReservation }) {
  if (!booking.guarantee?.cardOnFile) return null
  return (
    <div className="guarantee-confirmation">
      <p className="booking-sent">Kortgarantin är sparad - inget har dragits från kortet.</p>
      <GuaranteeTermsText booking={booking} />
    </div>
  )
}

function CardForm({
  booking,
  guest,
  locationId,
  returnUrl,
  onConfirmed,
}: {
  booking: GuestReservation
  guest?: GuaranteeGuest
  locationId: string
  returnUrl: string
  onConfirmed: (b: GuestReservation) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true)
    setError(null)
    const result = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: returnUrl },
    })
    if (result.error) {
      setError(result.error.message ?? 'Kortet kunde inte sparas. Försök igen.')
      setBusy(false)
      return
    }
    try {
      onConfirmed(await confirmGuestReservation(locationId, booking.reservationId, booking.manageToken!))
    } catch (err) {
      setError(bookingErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="guarantee-form" aria-busy={busy || undefined}>
      {!ready && !loadFailed && <PaymentPrinting label="Skriver ut kortformuläret" />}
      {loadFailed && (
        <p className="notice error" role="alert">
          Kortformuläret kunde inte laddas. Ladda om sidan, eller ring restaurangen för att boka.
        </p>
      )}
      <div className={`pay-element${ready ? ' is-ready' : ''}`}>
      <PaymentElement
        onReady={() => setReady(true)}
        onLoadError={() => setLoadFailed(true)}
        options={{
          layout: { type: 'tabs' },
          wallets: { link: 'never' },
          defaultValues: guest
            ? {
                billingDetails: {
                  name: guest.name,
                  email: guest.email,
                  ...(guest.phone ? { phone: guest.phone } : {}),
                },
              }
            : undefined,
        }}
      />
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {busy && (
        <p className="notice is-ok" role="status">
          Kortet kontrolleras hos Stripe och bordet bokas. Det tar bara en liten stund - stäng inte sidan.
        </p>
      )}
      <button type="submit" className={`btn-primary${busy ? ' is-busy' : ''}`} disabled={!stripe || !ready || busy}>
        {busy ? <><span className="spinner" aria-hidden="true" />Sparar kortet…</> : 'Spara kortet och boka'}
      </button>
    </form>
  )
}

export function GuaranteeStep({
  booking,
  guest,
  locationId,
  publishableKey,
  returnUrl,
  onConfirmed,
}: {
  booking: GuestReservation
  guest?: GuaranteeGuest
  locationId: string
  publishableKey: string | null
  returnUrl: string
  onConfirmed: (b: GuestReservation) => void
}) {
  const setup = booking.setup!
  const stripePromise = useMemo(
    () => (publishableKey ? stripeFor(publishableKey, setup.stripeAccount) : null),
    [publishableKey, setup.stripeAccount],
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(id)
  }, [])
  const left = minutesLeft(setup.expiresAt, now)
  // Formuläret byter färger med ljust/mörkt läge (Stripe läser inte sajtens CSS).
  const { theme } = useTheme()
  const fonts = useMemo(() => paymentFonts(), [])
  const appearance = useMemo(() => paymentAppearance(theme), [theme])

  return (
    <section className="booking-confirmation guarantee-step step-enter" aria-live="polite">
      <p className="hero-kicker">Nästan klart</p>
      <h1>Kortgaranti</h1>
      <p>
        Restaurangen tar kortgaranti för den här bokningen. Lägg in ditt kort så är bordet bokat -
        det hålls åt dig {left > 0 ? `i ${left} min till` : 'en kort stund till'}.
      </p>
      <GuaranteeTermsText booking={booking} />
      {!stripePromise ? (
        <p className="notice error" role="alert">
          Kortbetalningen är inte tillgänglig just nu. Ring restaurangen för att boka.
        </p>
      ) : left === 0 ? (
        <p className="notice error" role="alert">
          Tiden gick ut och bordet släpptes. Gör en ny bokning.
        </p>
      ) : (
        // key: ritas om när ljust/mörkt byts (Stripe uppdaterar inte ett öppet formulär).
        <Elements
          key={theme}
          stripe={stripePromise}
          options={{
            clientSecret: setup.clientSecret,
            appearance,
            fonts,
            loader: 'never',
          }}
        >
          <CardForm booking={booking} guest={guest} locationId={locationId} returnUrl={returnUrl} onConfirmed={onConfirmed} />
        </Elements>
      )}
      <SecureNote>Kortuppgifterna går direkt till Stripe och sparas aldrig hos oss.</SecureNote>
    </section>
  )
}
