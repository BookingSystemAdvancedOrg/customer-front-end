import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clearCart, clock, getOrder, kronor, orderErrorMessage, recallToken } from './orderApi'
import type { GuestOrder } from './orderApi'
import { FlowSteps } from '../../shared/FlowSteps'
import { Celebrate } from '../../shared/Celebrate'

/** Hur ofta sidan frågar om beställningen medan gästen väntar. */
export const STATUS_POLL_MS = 5_000
/** Så länge sidan väntar på att betalningen bekräftas innan den ger upp. */
const PAYMENT_WAIT_MS = 3 * 60_000

const FINAL = new Set<GuestOrder['status']>(['completed', 'cancelled', 'failed'])

/** Token ur länkens #-del (kvittomejlet), annars den fliken fick vid beställningen. */
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
  { status: 'completed', label: 'Hämtad' },
]

/** Vad som händer härnäst, under rubriken. */
function nextUp(order: GuestOrder): string | null {
  const table = order.tableLabel
    ? /^bord/i.test(order.tableLabel) ? order.tableLabel : `bord ${order.tableLabel}`
    : 'ditt bord'
  switch (order.status) {
    case 'pending_payment':
      return 'Det brukar ta några sekunder. Sidan uppdateras av sig själv.'
    case 'confirmed':
      return order.mode === 'pickup'
        ? 'Köket har fått beställningen. Vi sms:ar när maten lagas och när den är klar att hämta.'
        : `Köket har fått beställningen. Vi sms:ar när maten lagas och kommer till ${table}.`
    case 'preparing':
      return order.mode === 'pickup' ? 'Snart klart. Du får ett sms när maten går att hämta.' : 'Snart klart. Maten kommer till bordet.'
    case 'ready':
      return order.mode === 'pickup' ? 'Säg ditt namn eller beställningsnumret i kassan.' : null
    default:
      return null
  }
}

/** Ögonblicken som firas: betalningen gick igenom och maten är klar. */
const CELEBRATE = new Set<GuestOrder['status']>(['confirmed', 'ready'])

/**
 * Gästens beställning: /bestallning/<plats>/<id>. Hit går gästen när
 * betalningen på beställningssidan gått igenom (eller kommer tillbaka från
 * Swish, Klarna eller banken), och hit leder länken i kvittomejlet.
 * Sidan frågar var femte sekund tills beställningen är klar.
 */
export default function OrderStatusPage() {
  const { locationId = '', orderId = '' } = useParams()
  const [token] = useState(() => tokenFor(orderId))
  const [order, setOrder] = useState<GuestOrder | null>(null)
  const [error, setError] = useState<string | null>(
    token ? null : 'Länken är ofullständig. Använd länken i ditt kvitto (mejlet).',
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
        // Betald (även efter Swish/Klarna utanför sidan): varukorgen är förbrukad.
        if (next.paymentStatus === 'paid') clearCart(locationId)
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
  const steps = order?.mode === 'table' ? STEPS.map((s) => (s.status === 'completed' ? { ...s, label: 'Serverad' } : s)) : STEPS
  const hint = order ? nextUp(order) : null

  return (
    <section className={`booking-confirmation order-status${order && CELEBRATE.has(order.status) ? ' is-success' : ''}`}>
      {order && CELEBRATE.has(order.status) && <Celebrate key={order.status} />}
      {/* the number is what the guest says at the counter: big and green, top right */}
      <h1 className="order-head">
        {order?.number ? <>Beställning <span className="order-code">#{order.number}</span></> : 'Din beställning'}
      </h1>
      {!order && !error && (
        <div className="printing printing--inline" role="status" aria-label="Hämtar beställningen">
          <span className="printing__label">Hämtar beställningen</span>
          <i /><i /><i />
        </div>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      {order && (
        <>
          <p className={`booking-status${['ready', 'completed'].includes(order.status) ? ' stamp-ok' : ''}`} aria-live="polite" key={order.status}>
            {headline(order)}
          </p>
          {hint && <p className="order-next" aria-live="polite">{hint}</p>}
          {!['pending_payment', 'failed', 'cancelled'].includes(order.status) && (
            <FlowSteps steps={steps} current={stepIndex + 1} done={reachedAll} label="Beställning" />
          )}
          {order.mode === 'pickup' && ['confirmed', 'preparing'].includes(order.status) && order.readyEstimate && (
            <p className="order-hint">
              Beräknat klar ca <strong>{clock(order.readyEstimate)}</strong>. Du får ett sms när den är klar.
            </p>
          )}
          {order.status === 'ready' && order.mode === 'pickup' && order.location?.address && (
            <p className="order-hint">Hämta hos {order.location.name} - {order.location.address}.</p>
          )}
          {order.status === 'pending_payment' && gaveUp && (
            <p className="notice" role="status">
              Vi har inte fått besked om betalningen än. Har du betalat kommer ett kvitto via mejl
              så snart den är bekräftad.
            </p>
          )}
          {order.status === 'failed' && (
            <p className="notice error" role="status">
              Banken godkände inte betalningen, så inget har dragits från ditt kort. Varukorgen finns kvar:{' '}
              <Link to="/bestall">Försök igen</Link>.
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
          {order.discount && (
            <div className="cart-discount">
              <span>Rabatt {order.discount.percent} % ({order.discount.code})</span>
              <span>-{kronor(order.discount.amount)}</span>
            </div>
          )}
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
