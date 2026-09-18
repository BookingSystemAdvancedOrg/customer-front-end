import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { RESTAURANT } from '../../shared/restaurant'
import { BookingSteps } from './BokaBordPage'
import { formatBookingDate, readBookingDraft, saveBookingDraft } from './booking'

/**
 * Betalningssteget (Figma: betalning-page): kontaktuppgifter, kortformulär
 * och sammanfattning med "Belopp idag 0 kr".
 *
 * SÄKERHET: backend har varken reservations- eller betalnings-endpoint än,
 * så det här steget fullbordar bokningen som klientsidig förhandsvisning.
 * Kortfälten finns enligt designen men värdena lever ENBART i komponentens
 * tillstånd — de skickas ingenstans, sparas aldrig (inte ens i
 * session/localStorage) och loggas inte. Innan flödet går mot riktiga
 * betalningar ska fälten ersättas med en betalpartners hostade fält (t.ex.
 * Stripe Elements) — råa kortnummer får aldrig passera vår egen kod eller
 * vårt API (PCI DSS).
 */

interface FieldErrors {
  name?: string
  email?: string
  phone?: string
  cardNumber?: string
  expiry?: string
  cvc?: string
}

function validate(values: {
  name: string
  email: string
  phone: string
  cardNumber: string
  expiry: string
  cvc: string
}): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.name.trim()) errors.name = 'Namn krävs.'
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
    errors.email = 'Ange en giltig e-postadress.'
  }
  if (values.phone.replace(/[^\d]/g, '').length < 7) {
    errors.phone = 'Ange ett giltigt telefonnummer.'
  }
  if (!/^\d{13,19}$/.test(values.cardNumber.replace(/\s/g, ''))) {
    errors.cardNumber = 'Ange ett giltigt kortnummer.'
  }
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(values.expiry.trim())) {
    errors.expiry = 'Ange som MM/ÅÅ.'
  }
  if (!/^\d{3,4}$/.test(values.cvc.trim())) {
    errors.cvc = 'Ange kortets CVC.'
  }
  return errors
}

export default function BetalningPage() {
  const navigate = useNavigate()
  const draft = readBookingDraft()
  const [name, setName] = useState(draft?.contact?.name ?? '')
  const [email, setEmail] = useState(draft?.contact?.email ?? '')
  const [phone, setPhone] = useState(draft?.contact?.phone ?? '')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  // Utan påbörjad bokning finns inget att slutföra — börja om från steg 1.
  if (!draft) {
    return <Navigate to="/boka-bord" replace />
  }
  const { selection } = draft

  function confirm() {
    const found = validate({ name, email, phone, cardNumber, expiry, cvc })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    // Bara bokning + kontakt sparas — kortuppgifterna lämnar aldrig sidan.
    saveBookingDraft({
      selection,
      contact: { name: name.trim(), email: email.trim(), phone: phone.trim() },
    })
    navigate('/boka-bord/bekraftelse')
  }

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">Sista steget</p>
        <h1>Slutför din bokning</h1>
      </section>

      <BookingSteps current={3} />

      <div className="booking-layout">
        <div className="booking-main">
          <section className="form-card">
            <h2>Dina uppgifter</h2>
            <label>
              Namn
              <input
                type="text"
                autoComplete="name"
                placeholder="Erik Svensson"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
            <div className="form-row">
              <label>
                E-post
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="erik.svensson@epost.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errors.email && <span className="field-error">{errors.email}</span>}
              </label>
              <label>
                Telefon
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="+46 70 123 45 67"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {errors.phone && <span className="field-error">{errors.phone}</span>}
              </label>
            </div>
          </section>

          <section className="form-card">
            <h2>Kortuppgifter</h2>
            <label>
              Kortnummer
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234 1234 1234 1234"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
              {errors.cardNumber && (
                <span className="field-error">{errors.cardNumber}</span>
              )}
            </label>
            <div className="form-row">
              <label>
                Utgångsdatum
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="MM/ÅÅ"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
                {errors.expiry && <span className="field-error">{errors.expiry}</span>}
              </label>
              <label>
                CVC
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value)}
                />
                {errors.cvc && <span className="field-error">{errors.cvc}</span>}
              </label>
            </div>
            <p className="fine-print">
              Kortet debiteras inte idag — det används endast för att
              garantera din bokning enligt vår avbokningspolicy.
            </p>
          </section>

          <button type="button" className="btn primary wide" onClick={confirm}>
            Bekräfta bokning
          </button>
        </div>

        <aside className="booking-summary">
          <h2>Din bokning</h2>
          <dl>
            <div>
              <dt>Datum</dt>
              <dd>{formatBookingDate(selection.date)}</dd>
            </div>
            <div>
              <dt>Tid</dt>
              <dd>
                {selection.time}–{selection.endTime}
              </dd>
            </div>
            <div>
              <dt>Bord</dt>
              <dd>
                {selection.table.label} · {selection.table.seats} platser
              </dd>
            </div>
            <div>
              <dt>Gäster</dt>
              <dd>
                {selection.guests} {selection.guests === 1 ? 'person' : 'personer'}
              </dd>
            </div>
            <div>
              <dt>Plats</dt>
              <dd>
                {RESTAURANT.name}, {RESTAURANT.address.split(',')[0]}
              </dd>
            </div>
          </dl>
          <div className="summary-total">
            <span>Belopp idag</span>
            <span>0 kr</span>
          </div>
          <p className="summary-note">
            Priset för mat och dryck betalas i restaurangen. Avgift kan
            tillkomma vid sen avbokning eller utebliven ankomst, enligt
            avbokningspolicyn.
          </p>
        </aside>
      </div>
    </>
  )
}
