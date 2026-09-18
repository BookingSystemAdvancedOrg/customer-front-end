import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { RESTAURANT } from '../../shared/restaurant'
import {
  clearBookingDraft,
  formatBookingDate,
  generateBookingNumber,
  readBookingDraft,
} from './booking'

/**
 * Bekräftelsen (Figma: bekraftelse-page): grön bock, bokningsdetaljer och
 * knappar för kalender och startsidan. "Lägg till i kalender" bygger en
 * .ics-fil klientsidigt — ingen extern kalendertjänst anropas.
 */
export default function BekraftelsePage() {
  const navigate = useNavigate()
  const [draft] = useState(readBookingDraft)
  const [bookingNumber] = useState(generateBookingNumber)

  if (!draft?.contact) {
    return <Navigate to="/boka-bord" replace />
  }
  const { selection, contact } = draft

  function downloadCalendarEvent() {
    const start = `${selection.date.replaceAll('-', '')}T${selection.time.replace(':', '')}00`
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//KALLA//Bokning//SV',
      'BEGIN:VEVENT',
      `UID:${bookingNumber.replace('#', '')}@kalla`,
      `DTSTART:${start}`,
      `SUMMARY:Bordsbokning ${RESTAURANT.name}`,
      `LOCATION:${RESTAURANT.address}`,
      `DESCRIPTION:${selection.table.label} för ${selection.guests} · Bokningsnummer ${bookingNumber}`,
      'DURATION:PT2H',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'bokning-kalla.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  function goHome() {
    clearBookingDraft()
    navigate('/')
  }

  return (
    <section className="confirm-wrap">
      <span className="confirm-check" aria-hidden="true">
        ✓
      </span>
      <h1>Bokning bekräftad!</h1>
      <p className="hero-sub">
        Vi har skickat en bekräftelse via SMS till {contact.phone}. Vi ser fram
        emot ditt besök på {RESTAURANT.name}.
      </p>
      <div className="confirm-card">
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
            <dt>Bokningsnummer</dt>
            <dd>{bookingNumber}</dd>
          </div>
        </dl>
      </div>
      <div className="confirm-actions">
        <button type="button" className="btn ghost" onClick={downloadCalendarEvent}>
          Lägg till i kalender
        </button>
        <button type="button" className="btn primary" onClick={goHome}>
          Till startsidan
        </button>
      </div>
    </section>
  )
}
