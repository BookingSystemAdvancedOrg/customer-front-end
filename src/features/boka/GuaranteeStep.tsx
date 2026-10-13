import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import type { Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { bookingErrorMessage, confirmGuestReservation, formatFee } from './bookingApi'
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

// En Stripe-instans per (nyckel, konto) - loadStripe laddar js.stripe.com en gång.
const stripeCache = new Map<string, Promise<Stripe | null>>()
function stripeFor(publishableKey: string, account: string): Promise<Stripe | null> {
  const key = `${publishableKey}|${account}`
  let promise = stripeCache.get(key)
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount: account, locale: 'sv' })
    stripeCache.set(key, promise)
  }
  return promise
}

function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60000))
}

export function GuaranteeTermsText({ booking }: { booking: GuestReservation }) {
  const g = booking.guarantee
  if (!g) return null
  return (
    <ul className="guarantee-terms">
      <li>Inget dras från kortet nu.</li>
      {g.noShowFee > 0 && (
        <li>Kommer ni inte och inte har avbokat debiteras <strong>{formatFee(g.noShowFee)}</strong>.</li>
      )}
      {g.lateCancelFee > 0 && (
        <li>
          Avbokar du senare än {g.cancelCutoffHours} timmar före besöket debiteras{' '}
          <strong>{formatFee(g.lateCancelFee)}</strong>.
        </li>
      )}
      <li>Avbokar du i tid kostar det ingenting.</li>
    </ul>
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
    <form onSubmit={submit} className="guarantee-form">
      <PaymentElement
        onReady={() => setReady(true)}
        options={{
          layout: 'tabs',
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
      {error && <p className="notice error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary" disabled={!stripe || !ready || busy}>
        {busy ? 'Bekräftar…' : 'Spara kortet och boka'}
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

  return (
    <section className="booking-confirmation guarantee-step" aria-live="polite">
      <p className="hero-kicker">Nästan klart</p>
      <h1>Kortgaranti</h1>
      <p>
        Restaurangen tar kortgaranti för den här bokningen. Lägg in ditt kort för att slutföra -
        bordet hålls åt dig {left > 0 ? `i ${left} min till` : 'en kort stund till'}.
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
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: setup.clientSecret,
            appearance: { theme: 'night', variables: { colorPrimary: '#c9a24a', borderRadius: '8px' } },
          }}
        >
          <CardForm booking={booking} guest={guest} locationId={locationId} returnUrl={returnUrl} onConfirmed={onConfirmed} />
        </Elements>
      )}
      <p className="cell-muted">Kortuppgifterna hanteras av Stripe och sparas aldrig hos oss.</p>
    </section>
  )
}
