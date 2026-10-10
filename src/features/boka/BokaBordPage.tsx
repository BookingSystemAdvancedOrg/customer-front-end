import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'
import { getPublicActiveLayout, groupElementsByFloor, labelTables } from '../../shared/layoutApi'
import type { FloorGroup, LayoutTableElement } from '../../shared/layoutApi'
import {
  bookableDates,
  bookingErrorMessage,
  createReservation,
  formatDate,
  getAvailability,
  manageLink,
  seatsOf,
  todayIn,
} from './bookingApi'
import type { Availability, AvailabilitySlot, GuestReservation } from './bookingApi'
import { ApiError } from '../../shared/api'
import { FloorPlanSvg } from './FloorPlanSvg'
import { FloorPlan3D } from './FloorPlan3D'

const DEFAULT_MAX_PARTY = 12

interface Guest {
  name: string
  email: string
  phone: string
  notes: string
  marketingOptIn: boolean
  acceptTerms: boolean
}

const EMPTY_GUEST: Guest = {
  name: '', email: '', phone: '', notes: '', marketingOptIn: false, acceptTerms: false,
}

function guestError(g: Guest): string | null {
  if (!g.name.trim()) return 'Fyll i ditt namn.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email.trim())) return 'Fyll i en giltig e-postadress.'
  if (g.phone.replace(/[^\d]/g, '').length < 8) return 'Fyll i ett giltigt telefonnummer.'
  if (!g.acceptTerms) return 'Du behöver godkänna bokningsvillkoren.'
  return null
}

/**
 * Boka bord: datum och sällskap -> tid -> bord på planritningen -> dina
 * uppgifter -> bekräftelse. Lediga tider och bord kommer från
 * GET /availability (samma regler som backend kontrollerar vid bokningen),
 * och bokningen görs med POST /reservations. Hann någon annan ta bordet får
 * gästen välja igen med uppdaterad ledighet.
 */
export default function BokaBordPage() {
  const { config, location } = useSite()
  const info = useLocationInfo()
  const enabled = config.tenant.features.reservations
  const maxParty = location.maxPartySizeOnline || DEFAULT_MAX_PARTY
  const today = todayIn(location.timezone)
  const dates = useMemo(() => bookableDates(today), [today])

  const [partySize, setPartySize] = useState(2)
  const [date, setDate] = useState(today)
  const [refresh, setRefresh] = useState(0)
  const slotsKey = `${location.locationId}|${date}|${refresh}`
  const [fetched, setFetched] = useState<{
    key: string
    availability: Availability | null
    error: string | null
  } | null>(null)
  const current = fetched?.key === slotsKey ? fetched : null
  const availability = current?.availability ?? null
  const slotsError = current?.error ?? null
  const loadingSlots = enabled && current === null
  const [startTime, setStartTime] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [floors, setFloors] = useState<FloorGroup[] | null>(null)
  const [floorId, setFloorId] = useState<string | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [guest, setGuest] = useState<Guest>(EMPTY_GUEST)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [booked, setBooked] = useState<GuestReservation | null>(null)

  // Lediga tider för vald dag.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getAvailability(location.locationId, date)
      .then((a) => {
        if (!cancelled) setFetched({ key: slotsKey, availability: a, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFetched({
          key: slotsKey,
          availability: null,
          error:
            err instanceof ApiError && err.status === 400
              ? 'Den dagen går inte att boka online.'
              : bookingErrorMessage(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, location.locationId, date, slotsKey])

  // Planritningen (för bordsvalet).
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getPublicActiveLayout(location.locationId)
      .then((layout) => {
        if (cancelled) return
        const groups = groupElementsByFloor(layout)
        setFloors(groups)
        setFloorId(groups[0]?.floor?.floorId ?? null)
      })
      .catch(() => !cancelled && setFloors([]))
    return () => {
      cancelled = true
    }
  }, [enabled, location.locationId])

  const slots = useMemo(
    () =>
      (availability?.slots ?? []).filter(
        (s) => s.tables.reduce((sum, t) => sum + t.seats, 0) >= partySize,
      ),
    [availability, partySize],
  )
  const slot: AvailabilitySlot | null = slots.find((s) => s.startTime === startTime) ?? null
  const free = useMemo(
    () => new Map((slot?.tables ?? []).map((t) => [t.tableId, t.seats] as const)),
    [slot],
  )
  const chosenSeats = slot ? seatsOf(slot.tables, [...selected]) : 0
  const allTables = useMemo(
    () => (floors ?? []).flatMap((g) => g.elements.filter((e): e is LayoutTableElement => e.type === 'table')),
    [floors],
  )
  const labels = useMemo(() => labelTables(allTables), [allTables])
  const activeFloor = floors?.find((g) => g.floor?.floorId === floorId) ?? floors?.[0] ?? null

  // Byter man dag, tid eller sällskap gäller inte gamla bordsval längre.
  function choose(change: () => void) {
    change()
    setSelected(new Set())
    setFormError(null)
  }

  function toggleTable(tableId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tableId)) next.delete(tableId)
      else next.add(tableId)
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem =
      !slot ? 'Välj en tid.'
      : selected.size === 0 ? 'Välj minst ett bord.'
      : chosenSeats < partySize ? `Borden du valt har ${chosenSeats} platser - välj fler bord för ${partySize} personer.`
      : guestError(guest)
    if (problem) {
      setFormError(problem)
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await createReservation(location.locationId, {
        date,
        startTime: slot!.startTime,
        tableIds: [...selected],
        partySize,
        name: guest.name.trim(),
        email: guest.email.trim(),
        phone: guest.phone.trim(),
        notes: guest.notes.trim() || undefined,
        language: 'sv',
        marketingOptIn: guest.marketingOptIn,
        acceptTerms: true,
      })
      setBooked(result)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setFormError(bookingErrorMessage(err))
      if (err instanceof ApiError && err.status === 409) {
        setSelected(new Set())
        setRefresh((n) => n + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!enabled) {
    return (
      <section className="page-hero">
        <h1>Boka bord</h1>
        <p className="hero-sub">
          Ring oss på {info.phone || 'restaurangen'} så hjälper vi dig att boka bord.
        </p>
      </section>
    )
  }

  if (booked) {
    const link = booked.manageToken
      ? manageLink(window.location.origin, booked, location.locationId, booked.manageToken)
      : null
    return (
      <section className="booking-confirmation" aria-live="polite">
        <p className="hero-kicker">Tack, {booked.customerName}!</p>
        <h1>Ditt bord är bokat</h1>
        <dl className="booking-summary">
          <div><dt>Restaurang</dt><dd>{booked.location?.name ?? info.name}</dd></div>
          <div><dt>Datum</dt><dd>{formatDate(booked.date)}</dd></div>
          <div><dt>Tid</dt><dd>{booked.startTime}–{booked.endTime}</dd></div>
          <div><dt>Antal</dt><dd>{booked.partySize} personer</dd></div>
          <div>
            <dt>Bord</dt>
            <dd>{booked.tableIds.map((id) => labels.get(id) ?? id).join(', ')}</dd>
          </div>
          {booked.location?.address && <div><dt>Adress</dt><dd>{booked.location.address}</dd></div>}
        </dl>
        {link && (
          <div className="booking-manage">
            <p>
              Spara länken - med den kan du se och avboka din bokning:
            </p>
            <p className="booking-manage-link">
              <a href={link}>{link}</a>
            </p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void navigator.clipboard?.writeText(link)}
            >
              Kopiera länken
            </button>
          </div>
        )}
        <p className="cell-muted">
          Frågor? Ring {info.phone || 'restaurangen'}{info.email ? ` eller mejla ${info.email}` : ''}.
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">{info.name}</p>
        <h1>Boka bord</h1>
        <p className="hero-sub">Välj dag, tid och bord - bekräftelsen kommer direkt.</p>
      </section>

      <form className="booking" onSubmit={submit} noValidate>
        <fieldset className="booking-step">
          <legend>1. När och hur många?</legend>
          <label className="booking-field">
            <span>Antal personer</span>
            <select value={partySize} onChange={(e) => choose(() => setPartySize(Number(e.target.value)))}>
              {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'person' : 'personer'}</option>
              ))}
            </select>
          </label>
          <p className="cell-muted">
            Fler än {maxParty}? Ring oss på {info.phone || 'restaurangen'}.
          </p>
          <div className="booking-dates" role="group" aria-label="Välj datum">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                className={`filter-pill${d === date ? ' active' : ''}`}
                aria-pressed={d === date}
                onClick={() => choose(() => setDate(d))}
              >
                {d === today ? 'Idag' : formatDate(d)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="booking-step">
          <legend>2. Välj tid</legend>
          {loadingSlots && <p className="notice" role="status">Hämtar lediga tider…</p>}
          {slotsError && <p className="notice error" role="alert">{slotsError}</p>}
          {!loadingSlots && !slotsError && slots.length === 0 && (
            <p className="notice" role="status">
              Inga lediga tider för {partySize} personer {formatDate(date)}. Prova en annan dag.
            </p>
          )}
          <div className="booking-times" role="group" aria-label="Välj tid">
            {slots.map((s) => (
              <button
                key={s.startTime}
                type="button"
                className={`filter-pill${s.startTime === startTime ? ' active' : ''}`}
                aria-pressed={s.startTime === startTime}
                onClick={() => choose(() => setStartTime(s.startTime))}
              >
                {s.startTime}
              </button>
            ))}
          </div>
        </fieldset>

        {slot && (
          <fieldset className="booking-step">
            <legend>3. Välj bord</legend>
            <p className="cell-muted">
              Klicka på ett ledigt bord. Sällskapet behöver {partySize} platser
              {selected.size > 0 && ` - valda bord har ${chosenSeats}`}.
            </p>
            {floors && floors.length > 1 && (
              <div className="filter-row" role="group" aria-label="Välj våning">
                {floors.map((g) => (
                  <button
                    key={g.floor?.floorId ?? 'flat'}
                    type="button"
                    className={`filter-pill${activeFloor?.floor?.floorId === g.floor?.floorId ? ' active' : ''}`}
                    aria-pressed={activeFloor?.floor?.floorId === g.floor?.floorId}
                    onClick={() => setFloorId(g.floor?.floorId ?? null)}
                  >
                    {g.floor?.name ?? 'Planritning'}
                  </button>
                ))}
              </div>
            )}
            {activeFloor && (
              <>
                <div className="floor-view-toggle" role="group" aria-label="2D eller 3D">
                  <button type="button" className={view === '2d' ? 'active' : ''} aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D</button>
                  <button type="button" className={view === '3d' ? 'active' : ''} aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button>
                </div>
                {view === '2d' ? (
                  <FloorPlanSvg group={activeFloor} free={free} selected={selected} onToggle={toggleTable} />
                ) : (
                  <FloorPlan3D group={activeFloor} />
                )}
              </>
            )}
            <div className="booking-table-list" role="group" aria-label="Lediga bord">
              {slot.tables.map((t) => (
                <button
                  key={t.tableId}
                  type="button"
                  className={`filter-pill${selected.has(t.tableId) ? ' active' : ''}`}
                  aria-pressed={selected.has(t.tableId)}
                  onClick={() => toggleTable(t.tableId)}
                >
                  Bord {labels.get(t.tableId) ?? t.tableId} · {t.seats} pl
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {slot && selected.size > 0 && (
          <fieldset className="booking-step">
            <legend>4. Dina uppgifter</legend>
            <div className="booking-grid">
              <label className="booking-field">
                <span>Namn</span>
                <input autoComplete="name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
              </label>
              <label className="booking-field">
                <span>E-post</span>
                <input type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
              </label>
              <label className="booking-field">
                <span>Telefon</span>
                <input type="tel" autoComplete="tel" placeholder="070-123 45 67" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              </label>
              <label className="booking-field booking-field--wide">
                <span>Meddelande till restaurangen (valfritt)</span>
                <textarea maxLength={500} rows={3} placeholder="Allergier, barnstol, firande…" value={guest.notes} onChange={(e) => setGuest({ ...guest, notes: e.target.value })} />
              </label>
            </div>
            <label className="booking-check">
              <input type="checkbox" checked={guest.marketingOptIn} onChange={(e) => setGuest({ ...guest, marketingOptIn: e.target.checked })} />
              <span>Ja, {config.tenant.name} får skicka mig erbjudanden och nyheter (valfritt).</span>
            </label>
            <label className="booking-check">
              <input type="checkbox" checked={guest.acceptTerms} onChange={(e) => setGuest({ ...guest, acceptTerms: e.target.checked })} />
              <span>
                Jag godkänner <Link to="/bokningsvillkor" target="_blank">bokningsvillkoren</Link> och har läst{' '}
                <Link to="/integritetspolicy" target="_blank">integritetspolicyn</Link>.
              </span>
            </label>
            <div className="booking-summary-line" aria-live="polite">
              {formatDate(date)} kl {slot.startTime}–{slot.endTime} · {partySize} personer · bord{' '}
              {[...selected].map((id) => labels.get(id) ?? id).join(', ')}
            </div>
            {formError && <p className="notice error" role="alert">{formError}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Bokar…' : 'Boka bordet'}
            </button>
          </fieldset>
        )}
        {formError && !(slot && selected.size > 0) && (
          <p className="notice error" role="alert">{formError}</p>
        )}
      </form>
    </>
  )
}
