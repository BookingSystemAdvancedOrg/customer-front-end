import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import {
  acceptOffer,
  bankIdMessage,
  documentLink,
  errorMessage,
  getRequest,
  kronor,
  rejectOffer,
  requestChange,
  signingStatus,
  startCheckout,
  startSigning,
  tokenFor,
} from './cateringApi'
import type { CateringPayment, GuestRequest, Line, Totals } from './cateringApi'
import { useSite } from '../../shared/SiteContext'
import { PaidStamp, PaymentTicket } from '../../shared/payment/PaymentTicket'

/** BankID: frågan om status en gång i sekunden (QR-koden byts varje sekund). */
export const SIGN_POLL_MS = 1_000

const HEADLINE: Record<GuestRequest['status'], string> = {
  requested: 'Tack! Din förfrågan är skickad.',
  offer_sent: 'Din offert är klar',
  change_requested: 'Restaurangen tittar på dina ändringar',
  signed: 'Offerten är signerad',
  confirmed: 'Din catering är bekräftad',
  delivered: 'Levererad - tack!',
  closed: 'Levererad - tack!',
  declined: 'Restaurangen kunde tyvärr inte ta emot beställningen',
  rejected: 'Du har avböjt offerten',
  expired: 'Förfrågan har gått ut',
  cancelled: 'Beställningen är avbokad av restaurangen',
}

function isMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

function LinesTable({ lines, totals }: { lines: Line[]; totals: Totals }) {
  return (
    <>
      <ul className="cart-list">
        {lines.map((l, i) => (
          <li key={i}>
            <span className="cart-item-name">{l.quantity} × {l.name}</span>
            <span className="cell-muted">{kronor(l.unitPrice)}</span>
            <span className="cart-item-price">{kronor(l.unitPrice * l.quantity)}</span>
          </li>
        ))}
      </ul>
      {totals.discount > 0 && (
        <div className="cart-total"><span>Rabatt {totals.discountPercent} %</span><span>-{kronor(totals.discount)}</span></div>
      )}
      {totals.deliveryFee > 0 && (
        <div className="cart-total"><span>Leverans</span><span>{kronor(totals.deliveryFee)}</span></div>
      )}
      {(totals.cleaningFee ?? 0) > 0 && (
        <div className="cart-total"><span>Rengöringsavgift</span><span>{kronor(totals.cleaningFee)}</span></div>
      )}
      <div className="cart-total"><span>Totalt inkl. moms</span><span>{kronor(totals.total)}</span></div>
      <p className="cart-note">varav moms {totals.vatRate ?? 12} %: {kronor(totals.vat)}</p>
    </>
  )
}

/**
 * Gästens sida för en cateringförfrågan (länken i mejl/sms:
 * /catering/<plats>/<id>#t=<token>). Visar status och offerten, och låter
 * gästen signera med BankID (QR-kod på en annan enhet eller BankID-appen
 * på samma enhet), be om ändringar, avböja och - som privatperson - betala.
 */
export default function CateringRequestPage() {
  const { locationId = '', requestId = '' } = useParams()
  const { hash, search } = useLocation()
  const [token] = useState(() => tokenFor(requestId, hash))
  const [request, setRequest] = useState<GuestRequest | null>(null)
  const [error, setError] = useState<string | null>(token ? null : 'Länken är ofullständig. Använd länken i ditt mejl eller sms.')
  const [busy, setBusy] = useState(false)
  const [signing, setSigning] = useState<{ hint?: string; qr?: string; autoStartToken?: string } | null>(null)
  const [mode, setMode] = useState<'change' | 'reject' | 'accept' | null>(null)
  const [acceptForm, setAcceptForm] = useState({ name: '', role: '', authority: false, terms: false })
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const params = new URLSearchParams(search)
  const { config } = useSite()
  const [payment, setPayment] = useState<CateringPayment | null>(null)
  // Betald här på sidan (eller tillbaka från Swish/Klarna): Stripes webhook bekräftar strax.
  const [justPaid, setJustPaid] = useState(false)
  const awaitingConfirm = (justPaid || params.get('betalning') === 'klar') && request?.status === 'signed'
  const paid = useCallback(() => {
    setPayment(null)
    setJustPaid(true)
  }, [])

  const load = useCallback(async () => {
    try {
      setRequest(await getRequest(locationId, requestId, token))
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [locationId, requestId, token])

  useEffect(() => {
    if (!token) return
    let active = true
    getRequest(locationId, requestId, token).then(
      (r) => active && setRequest(r),
      (err: unknown) => active && setError(errorMessage(err)),
    )
    return () => {
      active = false
      window.clearTimeout(timer.current)
    }
  }, [locationId, requestId, token])

  // Tillbaka från signeringstjänstens sida: fråga en gång hur det gick.
  const returnedFromSigning = params.get('signering') === 'klar'
  useEffect(() => {
    if (!returnedFromSigning || request?.status !== 'offer_sent' || !token) return
    let active = true
    signingStatus(locationId, requestId, token).then(
      (state) => active && state.request && setRequest(state.request),
      () => {},
    )
    return () => {
      active = false
    }
  }, [returnedFromSigning, request?.status, locationId, requestId, token])

  // Tillbaka från betalningen: Stripe bekräftar via webhook - fråga några gånger.
  useEffect(() => {
    if (!awaitingConfirm) return
    const t = window.setTimeout(() => void load(), 3000)
    return () => window.clearTimeout(t)
  }, [request, load, awaitingConfirm])

  async function showQr(data: string | undefined) {
    if (!data) return undefined
    try {
      return await QRCode.toDataURL(data, { margin: 1, width: 280 })
    } catch {
      return undefined
    }
  }

  async function poll() {
    try {
      const state = await signingStatus(locationId, requestId, token)
      if (state.status === 'pending') {
        setSigning((s) => ({ ...s, hint: state.hintCode }))
        const qr = await showQr(state.qrData)
        if (qr) setSigning((s) => (s ? { ...s, qr } : s))
        timer.current = window.setTimeout(() => void poll(), SIGN_POLL_MS)
        return
      }
      if (state.status === 'complete' && state.request) {
        setSigning(null)
        setRequest(state.request)
        return
      }
      setSigning(null)
      setError(state.status === 'failed' ? bankIdMessage(state.hintCode, isMobile()) : null)
      await load()
    } catch (err) {
      setSigning(null)
      setError(errorMessage(err))
      await load()
    }
  }

  async function sign() {
    setError(null)
    setBusy(true)
    try {
      const start = await startSigning(locationId, requestId, token)
      if (start.kind === 'redirect' && start.url) {
        window.location.assign(start.url)
        return
      }
      setSigning({ hint: 'outstandingTransaction', qr: await showQr(start.qrData), autoStartToken: start.autoStartToken })
      if (isMobile() && start.autoStartToken) {
        window.location.href = `https://app.bankid.com/?autostarttoken=${start.autoStartToken}&redirect=null`
      }
      timer.current = window.setTimeout(() => void poll(), SIGN_POLL_MS)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function pay() {
    setError(null)
    setBusy(true)
    try {
      setPayment(await startCheckout(locationId, requestId, token))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function openDocument(docId: 'offer' | 'signed') {
    setError(null)
    try {
      // Same tab: a window opened after an await is blocked by iOS Safari. The link lives 5 minutes.
      window.location.assign((await documentLink(locationId, requestId, token, docId)).url)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function send() {
    setError(null)
    const company = request?.customerType === 'company'
    if (mode === 'accept') {
      if (!acceptForm.name.trim()) return setError('Fyll i ditt namn.')
      if (company && !acceptForm.role.trim()) return setError('Fyll i din roll i företaget.')
      if (company && !acceptForm.authority) return setError('Bekräfta att du får teckna avtal för företaget.')
      if (!acceptForm.terms) return setError('Kryssa i att du godkänner offerten och villkoren.')
    }
    setBusy(true)
    try {
      setRequest(mode === 'accept'
        ? await acceptOffer(locationId, requestId, token, {
          name: acceptForm.name.trim(), acceptTerms: true,
          ...(company ? { role: acceptForm.role.trim(), confirmAuthority: true as const } : {}),
        })
        : mode === 'change'
          ? await requestChange(locationId, requestId, token, message.trim())
          : await rejectOffer(locationId, requestId, token, message.trim()))
      setMode(null)
      setMessage('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="booking-confirmation catering-request">
      <h1>Catering</h1>
      {!request && !error && <p className="notice" role="status">Hämtar förfrågan…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {request && (
        <>
          <p className="booking-status" aria-live="polite">{HEADLINE[request.status]}</p>
          {request.status === 'requested' && (
            <p className="order-hint">
              Restaurangen går igenom förfrågan och skickar en offert till {request.customerName.split(' ')[0]} via
              mejl och sms. Spara länken i mejlet - där kan du följa förfrågan.
            </p>
          )}
          <dl className="booking-summary">
            {request.location?.name && <div><dt>Restaurang</dt><dd>{request.location.name}</dd></div>}
            <div><dt>Datum</dt><dd>{request.deliveryDate} kl {request.deliveryTime}</dd></div>
            <div>
              <dt>{request.fulfilment === 'delivery' ? 'Leverans' : 'Avhämtning'}</dt>
              <dd>
                {request.fulfilment === 'delivery' && request.deliveryAddress
                  ? `${request.deliveryAddress.street}, ${request.deliveryAddress.city}`
                  : request.location?.address ?? ''}
              </dd>
            </div>
            <div><dt>Beställare</dt><dd>{request.companyName ? `${request.companyName}, ` : ''}{request.customerName}</dd></div>
          </dl>

          {request.offer && !['declined', 'expired'].includes(request.status) ? (
            <div className="catering-offer">
              <h2>Offert{request.offer.version > 1 ? ` (version ${request.offer.version})` : ''}</h2>
              {request.offer.message && <p className="catering-message">”{request.offer.message}”</p>}
              <LinesTable lines={request.offer.lines} totals={request.offer.totals} />
              <p className="cart-note">
                Gäller till och med {request.offer.validUntil}.
                {request.customerType === 'company'
                  ? ` Faktureras ${request.paymentTermsDays ?? 30} dagar netto efter signering.`
                  : ' Betalas med kort eller Swish direkt efter signering.'}
              </p>
              {request.offer.terms && (
                <details className="catering-terms">
                  <summary>Villkor</summary>
                  <p>{request.offer.terms}</p>
                </details>
              )}
              {request.documents && request.documents.length > 0 && (
                <p className="catering-documents">
                  {request.documents.includes('offer') && (
                    <button type="button" className="link-button" onClick={() => void openDocument('offer')}>
                      Offerten som PDF
                    </button>
                  )}
                  {request.documents.includes('signed') && (
                    <button type="button" className="link-button" onClick={() => void openDocument('signed')}>
                      Signerad offert (PDF)
                    </button>
                  )}
                </p>
              )}
            </div>
          ) : (
            request.request && (
              <div className="catering-offer">
                <h2>Din förfrågan</h2>
                <LinesTable lines={request.request.lines} totals={request.request} />
              </div>
            )
          )}

          {request.status === 'offer_sent' && !request.canSign && (
            <p className="order-hint" role="status">
              Restaurangen signerar offerten först. Du får ett mejl och sms när du kan signera.
            </p>
          )}
          {request.canSign && !signing && !mode && (
            <div className="catering-actions">
              <p>
                Restaurangen har signerat. Genom att signera godkänner du offerten och villkoren och avtalet blir
                bindande. Beställningen kan sedan bara avbokas av restaurangen.
              </p>
              <button type="button" className={`btn-primary${busy ? ' is-busy' : ''}`} disabled={busy} onClick={() => void sign()}>
                Signera med BankID
              </button>
              {request.canAccept && (
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => setMode('accept')}>
                  Godkänn utan BankID
                </button>
              )}
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setMode('change')}>
                Be om ändringar
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setMode('reject')}>
                Avböj offerten
              </button>
            </div>
          )}

          {signing && (
            <div className="bankid-box" role="status" aria-live="polite">
              <p className="bankid-hint">{bankIdMessage(signing.hint, isMobile())}</p>
              {signing.qr && !isMobile() && <img className="bankid-qr" src={signing.qr} alt="QR-kod för BankID" />}
              {signing.autoStartToken && (
                <a className="btn-secondary"
                  href={isMobile()
                    ? `https://app.bankid.com/?autostarttoken=${signing.autoStartToken}&redirect=null`
                    : `bankid:///?autostarttoken=${signing.autoStartToken}&redirect=null`}>
                  Öppna BankID på den här enheten
                </a>
              )}
            </div>
          )}

          {mode === 'accept' && (
            <div className="catering-actions" role="group" aria-label="Godkänn utan BankID">
              <p>
                Har du inte svenskt BankID kan du godkänna offerten här. Vi sparar ditt namn, tidpunkten och vilken
                version du godkände.
              </p>
              <label className="booking-field booking-field--wide">
                Ditt namn
                <input autoComplete="name" value={acceptForm.name}
                  onChange={(e) => setAcceptForm({ ...acceptForm, name: e.target.value })} />
              </label>
              {request.customerType === 'company' && (
                <>
                  <label className="booking-field booking-field--wide">
                    Din roll i företaget
                    <input autoComplete="organization-title" value={acceptForm.role}
                      onChange={(e) => setAcceptForm({ ...acceptForm, role: e.target.value })} />
                  </label>
                  <label className="booking-check">
                    <input type="checkbox" checked={acceptForm.authority}
                      onChange={(e) => setAcceptForm({ ...acceptForm, authority: e.target.checked })} />
                    <span>Jag har rätt att teckna avtal för {request.companyName ?? 'företaget'}.</span>
                  </label>
                </>
              )}
              <label className="booking-check">
                <input type="checkbox" checked={acceptForm.terms}
                  onChange={(e) => setAcceptForm({ ...acceptForm, terms: e.target.checked })} />
                <span>Jag godkänner offerten och villkoren. Avtalet blir bindande.</span>
              </label>
              <button type="button" className={`btn-primary${busy ? ' is-busy' : ''}`} disabled={busy} onClick={() => void send()}>
                Godkänn offerten
              </button>
              <button type="button" className="btn-secondary" onClick={() => setMode(null)}>Tillbaka</button>
            </div>
          )}

          {(mode === 'change' || mode === 'reject') && (
            <div className="catering-actions" role="group" aria-label={mode === 'change' ? 'Be om ändringar' : 'Avböj offerten'}>
              <label className="booking-field booking-field--wide">
                {mode === 'change' ? 'Vad vill du ändra?' : 'Varför avböjer du? (valfritt)'}
                <textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
              <button type="button" className="btn-primary" disabled={busy || (mode === 'change' && !message.trim())}
                onClick={() => void send()}>
                {mode === 'change' ? 'Skicka till restaurangen' : 'Avböj offerten'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setMode(null)}>Tillbaka</button>
            </div>
          )}

          {request.status === 'change_requested' && request.changeMessage && (
            <p className="order-hint">Du skrev: ”{request.changeMessage}”. Du får en ny offert via mejl och sms.</p>
          )}
          {request.signedBy && (
            <p className="order-hint">
              {request.signedMethod === 'simple_acceptance' ? 'Godkänd' : 'Signerad med BankID'} av {request.signedBy}
              {request.signedAt ? ` ${request.signedAt.slice(0, 10)}` : ''}.
            </p>
          )}
          {awaitingConfirm && (
            <PaidStamp text="Betalt" next="Tack! Vi bekräftar betalningen hos restaurangen - sidan uppdateras av sig själv." />
          )}
          {request.canPay && !awaitingConfirm && payment && (
            <PaymentTicket
              publishableKey={config.stripe.publishableKey}
              stripeAccount={payment.stripeAccount}
              clientSecret={payment.clientSecret}
              title="Betala cateringen"
              summary={
                <div className="cart-total">
                  <span>Totalt inkl. moms</span>
                  <span>{request.offer ? kronor(request.offer.totals.total) : ''}</span>
                </div>
              }
              payLabel={`Betala ${request.offer ? kronor(request.offer.totals.total) : ''}`.trim()}
              onPaid={paid}
              onBack={() => setPayment(null)}
              backLabel="Inte nu"
            />
          )}
          {request.canPay && !awaitingConfirm && !payment && (
            <div className="catering-actions">
              {params.get('betalning') === 'avbruten' && (
                <p className="notice" role="status">Betalningen avbröts - inget har dragits. Signaturen gäller fortfarande.</p>
              )}
              <button type="button" className={`btn-primary${busy ? ' is-busy' : ''}`} disabled={busy} onClick={() => void pay()}>
                {busy
                  ? <><span className="spinner" aria-hidden="true" />Förbereder betalningen…</>
                  : `Betala ${request.offer ? kronor(request.offer.totals.total) : ''}`.trim()}
              </button>
            </div>
          )}
          {request.status === 'signed' && request.customerType === 'company' && (
            <p className="order-hint">Fakturan skapas och skickas till din e-post.</p>
          )}
          {request.invoiceUrl && (
            <p className="order-hint">
              Faktura {request.invoiceNumber}: <a href={request.invoiceUrl} target="_blank" rel="noreferrer">visa och betala</a>
            </p>
          )}
          {request.status === 'declined' && request.declineReason && <p className="order-hint">”{request.declineReason}”</p>}
          {request.status === 'cancelled' && (
            <p className="order-hint">
              {request.cancelReason ? `”${request.cancelReason}” ` : ''}Det du har betalat betalas tillbaka.
            </p>
          )}
          {['declined', 'rejected', 'expired'].includes(request.status) && (
            <p className="order-hint"><Link to="/catering">Gör en ny förfrågan</Link></p>
          )}
          {request.location?.phoneNumber && (
            <p className="cell-muted">Frågor? Ring {request.location.phoneNumber}{request.location.email ? ` eller mejla ${request.location.email}` : ''}.</p>
          )}
        </>
      )}
    </section>
  )
}
