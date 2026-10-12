import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clock, getOrder, kronor, orderErrorMessage, recallToken } from './orderApi'
import type { GuestOrder } from './orderApi'

/** Hur ofta sidan frågar om beställningen medan gästen väntar. */
export const STATUS_POLL_MS = 5_000
/** Så länge sidan väntar på att betalningen bekräftas innan den ger upp. */
const PAYMENT_WAIT_MS = 3 * 60_000

const FINAL = new Set<GuestOrder['status']>(['completed', 'cancelled', 'failed'])

/** Token ur länkens #-del (sms/mejl), annars den fliken fick vid beställningen. */
function tokenFor(orderId: string): string {
  try {
    const fromHash = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    if (fromHash) return fromHash
  } catch {
    // Trasig länk - prova fliken.
  }
  return recallToken(orderId) ?? ''
}

function headline(order: GuestOrder): string {
  const table = order.tableLabel
    ? /^bord/i.test(order.tableLabel) ? order.tableLabel : `bord ${order.tableLabel}`
    : 'ditt bord'
  switch (order.status) {
    case 'pending_payment':
      return 'Väntar på betalningen…'
    case 'confirmed':
      return order.mode === 'pickup' ? 'Tack! Beställningen är mottagen.' : `Tack! Vi serverar vid ${table}.`
    case 'preparing':
      return 'Maten tillagas.'
    case 'ready':
      return order.mode === 'pickup' ? 'Klar att hämta!' : 'Maten är på väg till bordet.'
    case 'completed':
      return order.mode === 'pickup' ? 'Hämtad - smaklig måltid!' : 'Serverad - smaklig måltid!'
    case 'cancelled':
      return 'Beställningen är avbruten av restaurangen.'
    case 'failed':
      return 'Betalningen gick inte igenom.'
  }
}

const STEPS: { status: GuestOrder['status']; label: string }[] = [
  { status: 'confirmed', label: 'Betald' },
  { status: 'preparing', label: 'Tillagas' },
  { status: 'ready', label: 'Klar' },
]

/**
 * Gästens beställning: /bestallning/<plats>/<id>. Hit skickar Stripe
 * tillbaka gästen efter betalningen, och hit leder länken i sms/mejl.
 * Sidan frågar var femte sekund tills beställningen är klar.
 */
export default function OrderStatusPage() {
  const { locationId = '', orderId = '' } = useParams()
  const [token] = useState(() => tokenFor(orderId))
  const [order, setOrder] = useState<GuestOrder | null>(null)
  const [error, setError] = useState<string | null>(
    token ? null : 'Länken är ofullständig. Använd länken i ditt sms eller kvitto.',
  )
  const [startedAt] = useState(() => Date.now())
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const next = await getOrder(locationId, orderId, token)
        if (cancelled) return
        setOrder(next)
        setError(null)
        const waitingTooLong = next.status === 'pending_payment' && Date.now() - startedAt > PAYMENT_WAIT_MS
        setGaveUp(waitingTooLong)
        if (!FINAL.has(next.status) && !waitingTooLong) timer = window.setTimeout(poll, STATUS_POLL_MS)
      } catch (err) {
        if (cancelled) return
        setError(orderErrorMessage(err))
        timer = window.setTimeout(poll, STATUS_POLL_MS * 3)
      }
    }
    void poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [locationId, orderId, token, startedAt])

  const stepIndex = order ? STEPS.findIndex((s) => s.status === order.status) : -1
  const reachedAll = order?.status === 'completed'

  return (
    <section className="booking-confirmation order-status">
      <h1>{order?.number ? `Beställning #${order.number}` : 'Din beställning'}</h1>
      {!order && !error && <p className="notice" role="status">Hämtar beställningen…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {order && (
        <>
          <p className="booking-status" aria-live="polite">{headline(order)}</p>
          {!['pending_payment', 'failed', 'cancelled'].includes(order.status) && (
            <ol className="order-steps">
              {STEPS.map((step, i) => (
                <li key={step.status} className={reachedAll || i <= stepIndex ? 'done' : ''}>
                  {step.label}
                </li>
              ))}
            </ol>
          )}
          {order.mode === 'pickup' && ['confirmed', 'preparing'].includes(order.status) && order.readyEstimate && (
            <p className="order-hint">
              Beräknat klar ca <strong>{clock(order.readyEstimate)}</strong>. Du får ett sms när den är klar.
            </p>
          )}
          {order.status === 'ready' && order.mode === 'pickup' && order.location?.address && (
            <p className="order-hint">Hämta hos {order.location.name} – {order.location.address}.</p>
          )}
          {order.status === 'pending_payment' && gaveUp && (
            <p className="notice" role="status">
              Vi har inte fått besked om betalningen än. Har du betalat kommer ett sms och ett kvitto
              så snart den är bekräftad.
            </p>
          )}
          {order.status === 'failed' && (
            <p className="notice error" role="status">
              Inget har dragits från ditt kort. <Link to="/bestall">Försök igen</Link>.
            </p>
          )}
          {order.status === 'cancelled' && (
            <p className="notice" role="status">
              Hela beloppet, {kronor(order.totalAmount)}, betalas tillbaka till ditt kort inom några bankdagar.
            </p>
          )}
          <ul className="cart-list order-status-lines">
            {order.lines.map((line) => (
              <li key={line.menuItemId}>
                <span className="cart-item-name">{line.quantity} × {line.name}</span>
                <span />
                <span className="cart-item-price">{kronor(line.total)}</span>
              </li>
            ))}
          </ul>
          <div className="cart-total">
            <span>Totalt</span>
            <span>{kronor(order.totalAmount)}</span>
          </div>
          {order.location?.phoneNumber && (
            <p className="cell-muted">Frågor? Ring {order.location.phoneNumber}.</p>
          )}
        </>
      )}
    </section>
  )
}
