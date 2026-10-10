import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  bookingErrorMessage,
  cancelGuestReservation,
  formatDate,
  getGuestReservation,
} from '../boka/bookingApi'
import type { GuestReservation } from '../boka/bookingApi'

const STATUS_TEXT: Record<string, string> = {
  pending: 'Väntar på bekräftelse',
  reserved: 'Bokad',
  arrived: 'Välkommen!',
  no_show: 'Ej uppdykt',
  no_show_charged: 'Ej uppdykt',
  no_show_charge_failed: 'Ej uppdykt',
  cancelled_no_charge: 'Avbokad',
  cancelled_charged: 'Avbokad',
  cancelled_charge_failed: 'Avbokad',
  cancelled_by_restaurant: 'Avbokad av restaurangen',
}

/** Token ur länkens #-del (skickas aldrig till servern som URL). */
function tokenFromHash(): string {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ''))
  } catch {
    return ''
  }
}

/**
 * Gästens egen bokning via länken från bekräftelsen:
 * /bokning/<plats>/<boknings-id>#<token>. Visar bokningen och låter gästen
 * avboka fram till starttiden.
 */
export default function ManageBookingPage() {
  const { locationId = '', reservationId = '' } = useParams()
  const [token] = useState(tokenFromHash)
  const [booking, setBooking] = useState<GuestReservation | null>(null)
  const [error, setError] = useState<string | null>(
    token ? null : 'Länken är ofullständig. Använd länken från din bokningsbekräftelse.',
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getGuestReservation(locationId, reservationId, token)
      .then((b) => !cancelled && setBooking(b))
      .catch((err: unknown) => !cancelled && setError(bookingErrorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [locationId, reservationId, token])

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      setBooking(await cancelGuestReservation(locationId, reservationId, token))
      setConfirming(false)
    } catch (err) {
      setError(bookingErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="booking-confirmation">
      <h1>Din bokning</h1>
      {!booking && !error && <p className="notice" role="status">Hämtar bokningen…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {booking && (
        <>
          <p className="booking-status" aria-live="polite">{STATUS_TEXT[booking.status] ?? booking.status}</p>
          <dl className="booking-summary">
            {booking.location?.name && <div><dt>Restaurang</dt><dd>{booking.location.name}</dd></div>}
            <div><dt>Namn</dt><dd>{booking.customerName}</dd></div>
            <div><dt>Datum</dt><dd>{formatDate(booking.date)}</dd></div>
            <div><dt>Tid</dt><dd>{booking.startTime}–{booking.endTime}</dd></div>
            <div><dt>Antal</dt><dd>{booking.partySize} personer</dd></div>
            {booking.location?.address && <div><dt>Adress</dt><dd>{booking.location.address}</dd></div>}
          </dl>
          {booking.cancellable && !confirming && (
            <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
              Avboka
            </button>
          )}
          {booking.cancellable && confirming && (
            <div className="booking-confirm-cancel" role="group" aria-label="Bekräfta avbokning">
              <p>Vill du avboka bordet {formatDate(booking.date)} kl {booking.startTime}?</p>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void cancel()}>
                {busy ? 'Avbokar…' : 'Ja, avboka'}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Nej, behåll
              </button>
            </div>
          )}
          {booking.location?.phoneNumber && (
            <p className="cell-muted">
              Frågor eller ändringar? Ring {booking.location.phoneNumber}.
            </p>
          )}
        </>
      )}
    </section>
  )
}
