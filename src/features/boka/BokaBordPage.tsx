import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isApiConfigured } from '../../shared/api'
import { isLocationConfigured, LOCATION_ID } from '../../shared/config'
import {
  fetchAvailability,
  formatBookingDate,
  gridPositions,
  labelTables,
  nextSevenDays,
  saveBookingDraft,
} from './booking'
import type { AvailabilitySlot, AvailabilityResult, LabeledTable } from './booking'

/** Stegindikatorn (Figma: 1 Datum & tid · 2 Välj bord · 3 Dina uppgifter). */
export function BookingSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Datum & tid', 'Välj bord', 'Dina uppgifter']
  return (
    <ol className="booking-steps">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const state = n < current ? 'done' : n === current ? 'active' : ''
        return (
          <li key={label} className={state} aria-current={n === current ? 'step' : undefined}>
            <span className="step-dot">{n < current ? '✓' : n}</span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Planritningen (Figma: "Välj bord"). Borden kommer direkt från den valda
 * tidens availability-slot (riktiga tableId/seats från API:t) — det finns
 * ingen egen bordslista här. Positionerna i panelen är ett rutnät räknat ur
 * antalet bord, eftersom API:t inte ger geometri (den fulla planritningen
 * kräver inloggning, se booking.ts).
 */
function FloorPlan({
  tables,
  guests,
  selected,
  onSelect,
}: {
  tables: LabeledTable[]
  guests: number
  selected: string | null
  onSelect: (id: string) => void
}) {
  const positions = useMemo(() => gridPositions(tables.length), [tables.length])

  if (tables.length === 0) {
    return (
      <div className="floor-wrap">
        <p className="notice" role="status">
          Inga lediga bord för den valda tiden.
        </p>
      </div>
    )
  }

  return (
    <div className="floor-wrap">
      <div className="floor" role="group" aria-label="Lediga bord för vald tid">
        <span className="floor-label">Entré</span>
        <span className="floor-bar">Bar</span>
        {tables.map((table, i) => {
          const tooSmall = table.seats < guests
          const isSelected = selected === table.tableId
          const pos = positions[i]
          return (
            <button
              key={table.tableId}
              type="button"
              className={`floor-table${isSelected ? ' selected' : ''}${tooSmall ? ' taken' : ''}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              disabled={tooSmall}
              aria-pressed={isSelected}
              aria-label={`${table.label}, ${table.seats} platser${tooSmall ? ', för få platser' : ''}`}
              onClick={() => onSelect(table.tableId)}
            >
              {table.label.replace('Bord ', '')}
              <small>{table.seats} pl</small>
            </button>
          )
        })}
      </div>
      <p className="floor-legend">
        <span className="dot free" /> Ledig <span className="dot chosen" /> Vald{' '}
        <span className="dot busy" /> För få platser
      </p>
    </div>
  )
}

/**
 * Boka bord (Figma: boka-bord-page): datum, tid, antal gäster och bord.
 * Tider OCH bord kommer direkt från den publika availability-rutten för
 * valt datum — ingen mock, ingen fallback på öppettider. Ett tomt svar
 * (stängt, fullbokat, eller ingen publicerad layout) visas ärligt som
 * "inga lediga tider" i stället för påhittad data.
 */
export default function BokaBordPage() {
  const navigate = useNavigate()
  const days = useMemo(() => nextSevenDays(), [])
  const [date, setDate] = useState(days[0].date)
  /** Senast hämtade datum + resultat, så "laddar" kan härledas i stället
   *  för att sättas synkront i effekten (undviker en extra render). */
  const [fetched, setFetched] = useState<{ date: string; result: AvailabilityResult } | null>(
    null,
  )
  const [time, setTime] = useState<string | null>(null)
  const [guests, setGuests] = useState(2)
  const [tableId, setTableId] = useState<string | null>(null)

  const apiReady = isApiConfigured() && isLocationConfigured()

  useEffect(() => {
    if (!apiReady || !LOCATION_ID) return
    let cancelled = false
    fetchAvailability(LOCATION_ID, date).then((result) => {
      if (!cancelled) setFetched({ date, result })
    })
    return () => {
      cancelled = true
    }
  }, [date, apiReady])

  // Ett bordsval hör till en viss tid, och en tid till ett visst datum —
  // React-mönstret för att "justera state" vid en propändring: jämför mot
  // föregående värde och sätt om under rendering i stället för i en effekt
  // (se https://react.dev/learn/you-might-not-need-an-effect).
  const [lastDate, setLastDate] = useState(date)
  if (date !== lastDate) {
    setLastDate(date)
    setTime(null)
    setTableId(null)
  }
  const [lastTime, setLastTime] = useState(time)
  if (time !== lastTime) {
    setLastTime(time)
    setTableId(null)
  }

  const loading = apiReady && (!fetched || fetched.date !== date)
  const availability = fetched?.date === date ? fetched.result : null
  const slots: AvailabilitySlot[] = availability?.status === 'ok' ? availability.slots : []
  const selectedSlot = slots.find((s) => s.startTime === time) ?? null
  const availableTables = useMemo(
    () => labelTables(selectedSlot?.tables ?? []),
    [selectedSlot],
  )
  const selectedTable = availableTables.find((t) => t.tableId === tableId) ?? null
  const tableValid = selectedTable !== null && selectedTable.seats >= guests
  const complete = Boolean(selectedSlot) && tableValid

  function proceed() {
    if (!selectedSlot || !tableValid || !selectedTable) return
    saveBookingDraft({
      selection: {
        date,
        time: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        guests,
        table: selectedTable,
      },
    })
    navigate('/boka-bord/betalning')
  }

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">Reservera ditt bord</p>
        <h1>Boka Bord</h1>
        <p className="hero-sub">
          Välj datum, tid och bord hos KÄLLA. Vi bekräftar din bokning direkt
          via SMS.
        </p>
      </section>

      <BookingSteps current={1} />

      {!apiReady && (
        <p className="notice error" role="alert">
          Bokning är inte tillgänglig just nu — kontakta oss gärna direkt.
        </p>
      )}
      {availability?.status === 'error' && (
        <p className="notice error" role="alert">
          {availability.message}
        </p>
      )}

      <div className="booking-layout">
        <div className="booking-main">
          <h2 className="field-label">Välj datum</h2>
          <div className="pill-row" role="group" aria-label="Välj datum">
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                className={`day-pill${date === d.date ? ' active' : ''}`}
                aria-pressed={date === d.date}
                onClick={() => setDate(d.date)}
              >
                <small>{d.weekday}</small>
                {d.dayOfMonth}
              </button>
            ))}
          </div>

          <h2 className="field-label">Välj tid</h2>
          {loading && (
            <p className="notice" role="status">
              Hämtar lediga tider…
            </p>
          )}
          {availability?.status === 'ok' && slots.length === 0 && (
            <p className="notice" role="status">
              Inga lediga tider den här dagen — prova ett annat datum.
            </p>
          )}
          <div className="pill-row" role="group" aria-label="Välj tid">
            {slots.map((slot) => (
              <button
                key={slot.startTime}
                type="button"
                className={`time-pill${time === slot.startTime ? ' active' : ''}`}
                aria-pressed={time === slot.startTime}
                onClick={() => setTime(slot.startTime)}
              >
                {slot.startTime}
              </button>
            ))}
          </div>

          <h2 className="field-label">Antal gäster</h2>
          <div className="guest-stepper">
            <button
              type="button"
              onClick={() => setGuests((g) => Math.max(1, g - 1))}
              aria-label="Färre gäster"
            >
              −
            </button>
            <span>
              {guests} {guests === 1 ? 'gäst' : 'gäster'}
            </span>
            <button
              type="button"
              onClick={() => setGuests((g) => Math.min(12, g + 1))}
              aria-label="Fler gäster"
            >
              +
            </button>
          </div>

          <h2 className="field-label">Välj bord</h2>
          {selectedSlot ? (
            <FloorPlan
              tables={availableTables}
              guests={guests}
              selected={tableId}
              onSelect={setTableId}
            />
          ) : (
            <p className="notice" role="status">
              Välj en tid ovan för att se lediga bord.
            </p>
          )}
        </div>

        <aside className="booking-summary">
          <h2>Din bokning</h2>
          <dl>
            <div>
              <dt>Datum</dt>
              <dd>{formatBookingDate(date)}</dd>
            </div>
            <div>
              <dt>Tid</dt>
              <dd>
                {selectedSlot ? `${selectedSlot.startTime}–${selectedSlot.endTime}` : '—'}
              </dd>
            </div>
            <div>
              <dt>Bord</dt>
              <dd>
                {tableValid && selectedTable
                  ? `${selectedTable.label} · ${selectedTable.seats} platser`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Gäster</dt>
              <dd>
                {guests} {guests === 1 ? 'person' : 'personer'}
              </dd>
            </div>
          </dl>
          <p className="summary-note">
            Vi håller bordet i 15 minuter efter bokad tid. Blir ni försenade,
            ring oss så löser vi det.
          </p>
          <button
            type="button"
            className="btn primary wide"
            disabled={!complete}
            onClick={proceed}
          >
            Fortsätt till betalning →
          </button>
        </aside>
      </div>

      <section className="dark-band">
        <h2>Vår avbokningspolicy</h2>
        <p>
          Ditt kort sparas när du bekräftar bokningen men debiteras inte idag.
          Avboka kostnadsfritt fram till 24 timmar före bokad tid — därefter,
          eller vid utebliven ankomst, debiteras en avgift per person. Avboka
          via länken i bekräftelsen eller kontakta oss, så hjälper vi dig.
        </p>
      </section>
    </>
  )
}
