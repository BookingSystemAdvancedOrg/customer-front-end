import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { PaidStamp, PaymentTicket, SecureNote } from '../../shared/payment/PaymentTicket'
import { validEmail } from '../boka/bookingApi'
import { clock, kronor, recallToken, tableCodeFrom } from '../bestall/orderApi'
import {
  billErrorMessage,
  billFromError,
  forgetPayment,
  getBillPayment,
  getTableBill,
  LINK_GONE,
  payTableBill,
  recallPayment,
  rememberPayment,
} from './notanApi'
import type { BillOrder, BillPayment, BillVat, PaidBill, TableBill } from './notanApi'
import { ApiError } from '../../shared/api'

/** Hur ofta sidan frågar om betalningen medan den bekräftas. */
export const BILL_POLL_MS = 2_000
/** Så länge sidan väntar på beskedet innan den slutar fråga. */
const BILL_WAIT_MS = 3 * 60_000

/** Nyckeln ur länkens #-del. */
function hashToken(): string {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ''))
  } catch {
    return ''
  }
}

function BillLines({ orders, vat, total, totalLabel }: { orders: BillOrder[]; vat: BillVat[]; total: number; totalLabel: string }) {
  return (
    <>
      {orders.map((order, i) => (
        <div className="bill-order" key={`${order.number ?? 'x'}-${i}`}>
          <p className="bill-order-head">
            <span>{order.number ? `#${order.number}` : 'Beställning'}</span>
            {order.createdAt && <span>{clock(order.createdAt)}</span>}
          </p>
          <ul className="cart-list bill-lines">
            {order.lines.map((line, j) => (
              <li key={j}>
                <span className="cart-item-name">{line.quantity} × {line.name}</span>
                <span />
                <span className="cart-item-price">{kronor(line.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {vat.length > 0 && (
        <dl className="sum-rows bill-vat">
          {vat.map((v) => <div key={v.rate}><dt>Varav moms {v.rate} %</dt><dd>{kronor(v.vat)}</dd></div>)}
        </dl>
      )}
      <div className="cart-total">
        <span>{totalLabel}</span>
        <span>{kronor(total)}</span>
      </div>
    </>
  )
}

/**
 * Notan vid bordet: /notan/<plats>#<betallänk> (personalens QR-kod för
 * notan) eller /notan/<plats>/<beställning> (från gästens statussida).
 * Gästen ser hela bordets obetalda nota och betalar den här med Stripe
 * (samma betalning som beställningar). Swish, Klarna och 3-D Secure
 * kommer tillbaka till /notan/<plats>?nota=<id>#<notans nyckel>, där sidan
 * väntar på beskedet.
 */
export default function NotanPage() {
  const { config } = useSite()
  const { locationId = '', orderId } = useParams()
  const { search } = useLocation()
  const [returned] = useState(() => {
    const billId = new URLSearchParams(search).get('nota')
    return billId ? { billId, billToken: hashToken() } : null
  })
  const [token] = useState(() => (returned ? '' : hashToken() || (orderId ? recallToken(orderId) ?? '' : '')))
  const [bill, setBill] = useState<TableBill | null>(null)
  const [error, setError] = useState<string | null>(() =>
    (returned ? !returned.billToken : !token) ? LINK_GONE : null)
  // Felet när gästen tryckte Betala (står kvar när notan hämtas om).
  const [payError, setPayError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payment, setPayment] = useState<BillPayment | null>(null)
  // Betalningen som bekräftas just nu (efter Stripe eller retur från Swish/Klarna).
  const [confirming, setConfirming] = useState<{ billId: string; billToken: string } | null>(returned)
  const [result, setResult] = useState<PaidBill | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  // Servern svarade bill_being_paid fast fliken har en påbörjad betalning: den är inte längre vår.
  const [takenOver, setTakenOver] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token || confirming) return
    let cancelled = false
    getTableBill(locationId, token, orderId)
      .then((next) => {
        if (cancelled) return
        setBill(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError && err.status === 404 ? LINK_GONE : billErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [locationId, orderId, token, attempt, confirming])

  // Betalningen bekräftas: fråga var annan sekund tills den är betald eller gick ut.
  useEffect(() => {
    if (!confirming?.billToken) return
    let cancelled = false
    let timer: number | undefined
    const started = Date.now()
    const poll = async () => {
      try {
        const next = await getBillPayment(locationId, confirming.billId, confirming.billToken)
        if (cancelled) return
        setResult(next)
        setError(null)
        if (next.status !== 'paying') {
          forgetPayment(locationId)
          return
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setError(LINK_GONE)
          return
        }
      }
      if (Date.now() - started > BILL_WAIT_MS) {
        setGaveUp(true)
        return
      }
      timer = window.setTimeout(poll, BILL_POLL_MS)
    }
    void poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [locationId, confirming])

  async function pay(e: FormEvent) {
    e.preventDefault()
    if (!bill || busy) return
    const typed = email.trim()
    if (typed && !validEmail(typed)) {
      setEmailError(true)
      setPayError('Fyll i en giltig e-postadress, eller lämna fältet tomt.')
      emailRef.current?.focus()
      return
    }
    setEmailError(false)
    setPayError(null)
    setBusy(true)
    const resume = recallPayment(locationId)
    try {
      const started = await payTableBill(locationId, token, orderId, {
        expectedAmount: bill.amount,
        ...(typed ? { email: typed } : {}),
        ...(resume && resume.amount === bill.amount ? { resumeBillId: resume.billId, resumeToken: resume.billToken } : {}),
      })
      rememberPayment(locationId, { billId: started.billId, billToken: started.billToken, amount: started.amount })
      setPayment(started)
    } catch (err) {
      const code = err instanceof ApiError ? err.message : ''
      // Upptagen: notan hämtas om och säger det själv (med Försök igen).
      // Servern tog inte vår påbörjade betalning, så någon annan betalar.
      if (code === 'bill_being_paid') setTakenOver(true)
      else setPayError(billErrorMessage(err))
      if (code === 'email must be a valid email address') setEmailError(true)
      const fresh = billFromError(err)
      if (fresh) setBill(fresh)
      else if (['bill_paid', 'bill_empty', 'bill_being_paid'].includes(code)) setAttempt((n) => n + 1)
      if (code === 'bill_processing') {
        const resumeNow = recallPayment(locationId)
        if (resumeNow) setConfirming({ billId: resumeNow.billId, billToken: resumeNow.billToken })
      }
    } finally {
      setBusy(false)
    }
  }

  const paid = useCallback(() => {
    if (payment) setConfirming({ billId: payment.billId, billToken: payment.billToken })
  }, [payment])

  function back() {
    setPayment(null)
    setAttempt((n) => n + 1)
  }

  const title = result?.tableTitle ?? bill?.tableTitle
  const heading = title ? `Notan för ${/^bord /i.test(title) ? `bord ${title.slice(5)}` : title}` : 'Notan'
  const resumable = Boolean(bill && recallPayment(locationId)?.amount === bill.amount)
  const lockedByOther = bill?.status === 'paying' && (!resumable || takenOver)

  return (
    <section className="booking-confirmation order-status notan">
      <h1 className="order-head">{heading}</h1>
      {bill?.location?.name && !confirming && <p className="cell-muted notan-place">{bill.location.name}</p>}

      {/* Laddar: notan skrivs ut. */}
      {!error && !confirming && !bill && (
        <div className="printing printing--inline" role="status" aria-label="Hämtar notan">
          <span className="printing__label">Hämtar notan</span>
          <i /><i /><i />
        </div>
      )}

      {confirming && !error && (!result || (result.status === 'paying' && !gaveUp)) && (
        <div className="printing printing--inline" role="status" aria-label="Betalningen bekräftas">
          <span className="printing__label">Betalningen bekräftas</span>
          <i /><i /><i />
        </div>
      )}

      {error && (error === LINK_GONE || confirming ? (
        <p className="notice error" role="alert">{error}</p>
      ) : (
        <div className="notice error notice--stack" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={() => { setError(null); setAttempt((n) => n + 1) }}>
            Försök igen
          </button>
        </div>
      ))}
      {payError && !confirming && !payment && <p className="notice error" role="alert" id="notan-error">{payError}</p>}

      {confirming && result && (
        <>
          {result.status === 'paid' && (
            <PaidStamp text="Betald" next="Tack! Notan är betald. Visa den här sidan om personalen frågar." />
          )}
          {result.status === 'paying' && gaveUp && (
            <p className="notice" role="status">
              Vi har inte fått besked om betalningen än. Har du betalat ser personalen det så snart den är bekräftad.
            </p>
          )}
          {(result.status === 'expired' || result.status === 'failed') && (
            <p className="notice error" role="status">
              Betalningen gick inte igenom, så inget har dragits. Skanna QR-koden för notan igen eller fråga personalen.
            </p>
          )}
          <BillLines orders={result.orders} vat={result.vat}
            total={result.amount} totalLabel={result.status === 'paid' ? 'Betalt' : 'Att betala'} />
        </>
      )}

      {!confirming && bill && (
        bill.count === 0 || bill.status === 'empty' ? (
          <>
            <p className="notice" role="status">Det finns inget att betala för bordet just nu.</p>
            {orderId && tableCodeFrom('') && <p><Link to="/bestall">Beställ mer</Link></p>}
          </>
        ) : payment ? (
          <PaymentTicket
            publishableKey={config.stripe.publishableKey}
            stripeAccount={payment.stripeAccount}
            clientSecret={payment.clientSecret}
            title="Betala notan"
            summary={<div className="cart-total"><span>Att betala</span><span>{kronor(payment.amount)}</span></div>}
            payLabel={`Betala ${kronor(payment.amount)}`}
            onPaid={paid}
            onBack={back}
            backLabel="Tillbaka till notan"
          />
        ) : (
          <>
            <BillLines orders={bill.orders} vat={bill.vat} total={bill.amount} totalLabel="Att betala" />
            {lockedByOther ? (
              <div className="notice notice--stack" role="status">
                <p>Någon vid bordet betalar notan just nu. Vänta en minut och försök igen, eller fråga personalen.</p>
                <button type="button" className="btn-secondary"
                  onClick={() => { setPayError(null); setTakenOver(false); setAttempt((n) => n + 1) }}>
                  Försök igen
                </button>
              </div>
            ) : (
              <form className="notan-pay" onSubmit={pay} noValidate aria-busy={busy || undefined}>
                <label className="booking-field">
                  <span>Kvitto till e-post (valfritt)</span>
                  <span className="field-hint">Fyll i om du vill få kvittot på mejl.</span>
                  <input type="email" autoComplete="email" value={email} ref={emailRef}
                    {...(emailError ? { 'aria-invalid': true as const, 'aria-describedby': 'notan-error' } : {})}
                    onChange={(e) => setEmail(e.target.value)} />
                </label>
                <button type="submit" className={`btn-primary checkout-next${busy ? ' is-busy' : ''}`} disabled={busy}>
                  {busy ? <><span className="spinner" aria-hidden="true" />Startar betalningen…</> : `Betala ${kronor(bill.amount)}`}
                </button>
                <SecureNote>
                  Du betalar hela notan för bordet. Betalningen sker hos Stripe och kortuppgifterna sparas aldrig hos oss.
                </SecureNote>
              </form>
            )}
          </>
        )
      )}
    </section>
  )
}
