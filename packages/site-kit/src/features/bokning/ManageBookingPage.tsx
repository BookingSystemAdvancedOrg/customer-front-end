import { useContext, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../shared/api'
import {
  bookingErrorMessage,
  cancelGuestReservation,
  confirmGuestReservation,
  formatDate,
  formatFee,
  getGuestReservation,
  lengthText,
} from '../boka/bookingApi'
import type { GuestReservation } from '../boka/bookingApi'
import { GuaranteeTermsText } from '../boka/GuaranteeStep'
import AddToCalendar from '../../shared/AddToCalendar'
import { bookingEvent, restaurantName } from '../../shared/calendar'
import { SiteContext } from '../../shared/SiteContext'
import { SkelLines } from '../../shared/Skeleton'
import { PhoneLink } from '../../shared/PhoneLink'
import { formatPhoneNational } from '../../shared/phone'

const STATUS_TEXT: Record<string, string> = {
  pending: 'Inte klar',
  expired: 'Inte slutförd - bordet släpptes',
  reserved: 'Bokad',
  arrived: 'Välkommen!',
  no_show: 'Ej uppdykt',
  no_show_charged: 'Ej uppdykt - avgift debiterad',
  no_show_charge_failed: 'Ej uppdykt',
  cancelled_no_charge: 'Avbokad',
  cancelled_charged: 'Avbokad - avgift debiterad',
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
  const [acceptFee, setAcceptFee] = useState(false)
  const [busy, setBusy] = useState(false)
  const feeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    getGuestReservation(locationId, reservationId, token)
      // Tillbaka från Stripe (3-D Secure med omdirigering) eller fliken
      // stängdes före bekräftelsen: slutför bokningen om kortet är klart.
      .then((b) =>
        b.status === 'pending'
          ? confirmGuestReservation(locationId, reservationId, token).catch(() => b)
          : b,
      )
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
      setBooking(await cancelGuestReservation(locationId, reservationId, token, acceptFee))
      setConfirming(false)
    } catch (err) {
      // Avgiften kan ha börjat gälla efter att sidan laddades: visa den nya
      // avgiften och rutan att godkänna den, med frågan kvar öppen.
      const newFee = err instanceof ApiError && err.message === 'fee_applies' ? Number(err.body.fee) : NaN
      if (newFee > 0) {
        setBooking((b) => (b?.guarantee ? { ...b, guarantee: { ...b.guarantee, cancellationFee: newFee } } : b))
        setAcceptFee(false)
        // Rutan som behöver kryssas i får fokus när den har ritats.
        requestAnimationFrame(() => feeRef.current?.focus())
      }
      const phone = booking?.location?.phoneNumber
      setError(bookingErrorMessage(err, phone ? formatPhoneNational(phone) : undefined))
    } finally {
      setBusy(false)
    }
  }

  const fee = booking?.guarantee?.cancellationFee ?? 0
  const tenantName = useContext(SiteContext)?.config.tenant.name

  return (
    <section className="booking-confirmation">
      <h1>Din bokning</h1>
      {!booking && !error && (
        <div className="skel" role="status" aria-label="Hämtar bokningen" aria-busy="true">
          <SkelLines n={5} />
        </div>
      )}
      {error && <p id="manage-booking-error" className="notice error" role="alert">{error}</p>}
      {booking && (
        <>
          <p className="booking-status" aria-live="polite">{STATUS_TEXT[booking.status] ?? booking.status}</p>
          <dl className="booking-summary">
            {booking.location?.name && <div><dt>Restaurang</dt><dd>{booking.location.name}</dd></div>}
            <div><dt>Namn</dt><dd>{booking.customerName}</dd></div>
            <div><dt>Datum</dt><dd>{formatDate(booking.date)}</dd></div>
            <div><dt>Tid</dt><dd>{booking.startTime}-{booking.endTime}</dd></div>
            {lengthText(booking) && <div><dt>Bokningstid</dt><dd>{lengthText(booking)}</dd></div>}
            <div><dt>Antal</dt><dd>{booking.partySize} personer</dd></div>
            {booking.location?.address && <div><dt>Adress</dt><dd>{booking.location.address}</dd></div>}
          </dl>
          {booking.status === 'reserved' && booking.cancellable && (
            <AddToCalendar
              event={bookingEvent(booking, {
                restaurant: restaurantName(tenantName, booking.location?.name),
                address: booking.location?.address,
                link: window.location.href,
              })}
            />
          )}
          {booking.status === 'pending' && (
            <p className="notice" role="status">
              Bokningen blev inte klar. <Link to="/boka-bord">Gör en ny bokning</Link>.
            </p>
          )}
          {booking.guarantee?.cardOnFile && booking.cancellable && <GuaranteeTermsText booking={booking} />}
          {booking.fee && booking.fee.status === 'succeeded' && (
            <p className="cell-muted">
              Debiterad avgift: {formatFee(booking.fee.amount)}
              {booking.fee.refundedAmount > 0 && ` (återbetalt ${formatFee(booking.fee.refundedAmount)})`}.
            </p>
          )}
          {booking.cancellable && !confirming && (
            <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
              Avboka
            </button>
          )}
          {booking.cancellable && confirming && (
            <div className="booking-confirm-cancel" role="group" aria-label="Bekräfta avbokning">
              <p>Vill du avboka bordet {formatDate(booking.date)} kl {booking.startTime}?</p>
              {fee > 0 && (
                <label className="booking-check fee-accept">
                  <input ref={feeRef} type="checkbox" checked={acceptFee} onChange={(e) => setAcceptFee(e.target.checked)}
                    aria-describedby={error ? 'manage-booking-error' : undefined} />
                  <span>
                    Det är mindre än {booking.guarantee!.cancelCutoffHours} timmar kvar. Jag godkänner att{' '}
                    <strong>{formatFee(fee)}</strong> debiteras mitt kort.
                  </span>
                </label>
              )}
              <button type="button" className="btn-primary" disabled={busy || (fee > 0 && !acceptFee)} onClick={() => void cancel()}>
                {busy ? 'Avbokar…' : 'Ja, avboka'}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Nej, behåll
              </button>
            </div>
          )}
          {booking.location?.phoneNumber && (
            <p className="cell-muted">
              Frågor eller ändringar? Ring <PhoneLink phone={booking.location.phoneNumber} />.
            </p>
          )}
        </>
      )}
    </section>
  )
}
