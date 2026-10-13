import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'
import { getPublicActiveLayout, groupElementsByFloor, labelTables } from '../../shared/layoutApi'
import type { FloorGroup, LayoutTableElement } from '../../shared/layoutApi'
import {
  EMAIL_MAX,
  NAME_MAX,
  NOTES_MAX,
  bookableDates,
  HOLD_EXPIRED_TEXT,
  bookingErrorMessage,
  clockText,
  createReservation,
  dayMessage,
  formatDate,
  getAvailability,
  holdTables,
  manageLink,
  needsCard,
  normalizePhone,
  releaseHold,
  staleSelection,
  todayIn,
  turnstileMissing,
  validEmail,
} from './bookingApi'
import type { Availability, AvailabilitySlot, GuestReservation, TableHold, TableOption } from './bookingApi'
import { GuaranteeStep } from './GuaranteeStep'
import { TurnstileWidget } from './TurnstileWidget'
import { ApiError } from '../../shared/api'
import { FloorPlanSvg } from './FloorPlanSvg'
import { FloorPlan3D } from './FloorPlan3D'

const DEFAULT_MAX_PARTY = 12
/** Hur ofta lediga tider hämtas om medan gästen väljer (tider inom 30
 * minuter försvinner ur listan när klockan går). */
export const SLOTS_REFRESH_MS = 60_000

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
  if (!validEmail(g.email)) return 'Fyll i en giltig e-postadress.'
  if (!normalizePhone(g.phone)) return 'Fyll i ett giltigt telefonnummer, t.ex. 070-123 45 67.'
  if (!g.acceptTerms) return 'Du behöver godkänna bokningsvillkoren.'
  return null
}

/** Hur länge bordet hålls - visas medan gästen fyller i uppgifterna och kortet. */
function HoldBanner({ secondsLeft, tables, onChange }: {
  secondsLeft: number
  tables: string
  onChange?: () => void
}) {
  const urgent = secondsLeft <= 120
  return (
    <div className={`hold-banner${urgent ? ' urgent' : ''}`} role="timer" aria-label={`Bordet hålls i ${clockText(secondsLeft)}`}>
      <span>
        Bord {tables} hålls åt dig i <strong className="hold-clock">{clockText(secondsLeft)}</strong>
        {urgent ? ' - slutför bokningen snart.' : '.'}
      </span>
      {onChange && (
        <button type="button" className="btn-secondary" onClick={onChange}>Byt bord</button>
      )}
    </div>
  )
}

/** Samma bord (ett bord eller samma kombination)? */
function sameTables(a: TableOption | null, b: TableOption | null): boolean {
  return Boolean(a && b && a.tableIds.join('+') === b.tableIds.join('+'))
}

/**
 * Boka bord: datum och sällskap -> tid -> bord på planritningen -> dina
 * uppgifter -> bekräftelse. Lediga tider och bord kommer från
 * GET /availability?partySize= (samma regler som backend kontrollerar vid
 * bokningen): varje tid listar bara bord - eller restaurangens
 * bordskombinationer - som passar sällskapet, så gästen väljer bland dem.
 * Bokningen görs med POST /reservations. Hann någon annan ta bordet får
 * gästen välja igen med uppdaterad ledighet.
 *
 * Avvikande dagar (stängt, andra tider, ingen onlinebokning) förklaras vid
 * tiderna och syns i datumlistan. Säkerhetskontrollen (Turnstile) visas
 * ovanför Boka-knappen när plattformen har den påslagen.
 *
 * Kortgaranti: kräver platsen kort för sällskapets storlek visas villkoren
 * innan gästen bokar, och efter bokningen (status "pending") Stripes
 * inbäddade kortformulär. Först när kortet är bekräftat är bordet bokat.
 *
 * Bordet hålls: när gästen bekräftar sina bord (POST /holds, med
 * säkerhetskontrollen) är de spärrade för alla andra i 15 minuter medan
 * uppgifterna - och kortet - fylls i. En nedräkning visas. Går tiden ut
 * släpps borden (DELETE /holds/{id}; servern släpper dem ändå själv) och
 * gästen börjar om från början med allt nollställt. "Byt bord" släpper
 * dem direkt, liksom att lämna sidan.
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
  // Hämta om: efter en nekad bokning (refresh) och varje minut (tick). Listan
  // som visas ligger kvar under tiden - bara en ny dag visar "Hämtar…".
  const [refresh, setRefresh] = useState(0)
  const [tick, setTick] = useState(0)
  const slotsKey = `${location.locationId}|${date}|${partySize}`
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
  // Det valda bordet - eller den valda bordskombinationen - för tiden.
  const [option, setOption] = useState<TableOption | null>(null)
  const selected = useMemo(() => new Set(option?.tableIds ?? []), [option])
  // Förklaring när en vald tid eller ett valt bord försvann vid en omhämtning.
  const [slotNotice, setSlotNotice] = useState<{ step: 'time' | 'tables'; text: string } | null>(null)
  const [floors, setFloors] = useState<FloorGroup[] | null>(null)
  const [floorId, setFloorId] = useState<string | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [guest, setGuest] = useState<Guest>(EMPTY_GUEST)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [booked, setBooked] = useState<GuestReservation | null>(null)
  const [pending, setPending] = useState<GuestReservation | null>(null)
  // Borden som hålls åt gästen och när tiden går ut (lokal klocka, räknad
  // från svaret - inte från serverns tidsstämpel, så en fel klocka i
  // telefonen inte ger fel nedräkning).
  const [hold, setHold] = useState<TableHold | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [holding, setHolding] = useState(false)
  const [restartNotice, setRestartNotice] = useState<string | null>(null)
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
  const terms = location.guarantee ?? null
  const cardNeeded = needsCard(terms, partySize, true)
  const turnstileSiteKey = config.turnstile?.siteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const specialByDate = useMemo(
    () => new Map((location.specialDays ?? []).map((d) => [d.date, d] as const)),
    [location.specialDays],
  )

  // Gästens senaste val - läses när en ny lista kommer, utan att varje
  // klick startar en ny hämtning.
  const latest = useRef({ startTime, option })
  useEffect(() => {
    latest.current = { startTime, option }
  })

  // Nollställ allt och börja om (tiden gick ut).
  function restart(text: string) {
    setHold(null)
    setDeadline(null)
    setPending(null)
    setPartySize(2)
    setDate(today)
    setStartTime(null)
    setOption(null)
    setGuest(EMPTY_GUEST)
    setFormError(null)
    setSlotNotice(null)
    setTurnstileToken(null)
    setTurnstileReset((n) => n + 1)
    setRefresh((n) => n + 1)
    setRestartNotice(text)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Det som släpps om gästen lämnar sidan: bara ett hållet bord som inte
  // blivit en bokning.
  const holdRef = useRef<TableHold | null>(null)
  const expired = useRef(false)
  const onExpire = useRef<() => void>(() => {})
  useEffect(() => {
    holdRef.current = hold && !booked && !pending ? hold : null
    onExpire.current = () => {
      if (expired.current || !hold) return
      expired.current = true
      void releaseHold(location.locationId, hold).catch(() => undefined)
      restart(HOLD_EXPIRED_TEXT)
    }
  })

  // Nedräkningen: en gång i sekunden; vid 0 släpps borden.
  useEffect(() => {
    if (deadline === null) return
    expired.current = false
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= deadline) onExpire.current()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [deadline])

  // Lämnar gästen sidan släpps borden direkt (annars när tiden gått ut).
  useEffect(() => {
    const letGo = () => {
      const h = holdRef.current
      if (h) void releaseHold(location.locationId, h, { keepalive: true }).catch(() => undefined)
      holdRef.current = null
    }
    window.addEventListener('pagehide', letGo)
    return () => {
      window.removeEventListener('pagehide', letGo)
      letGo()
    }
  }, [location.locationId])

  const choosing = enabled && !booked && !pending
  useEffect(() => {
    if (!choosing) return
    const timer = window.setInterval(() => setTick((n) => n + 1), SLOTS_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [choosing])

  // Lediga tider för vald dag. Försvinner den valda tiden (eller ett valt
  // bord) i en ny lista tas valet bort med en förklaring - annars skulle
  // gästen fylla i allt och få nej när bokningen skickas.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getAvailability(location.locationId, date, partySize)
      .then((a) => {
        if (cancelled) return
        setFetched({ key: slotsKey, availability: a, error: null })
        const cur = latest.current
        if (!cur.startTime) return
        const still = a.slots.find((s) => s.startTime === cur.startTime)
        if (!still) {
          setStartTime(null)
          setOption(null)
          setSlotNotice({ step: 'time', text: `${cur.startTime} går inte att boka längre. Välj en annan tid.` })
          return
        }
        if (cur.option && !(still.options ?? []).some((o) => sameTables(o, cur.option))) {
          setOption(null)
          setSlotNotice({ step: 'tables', text: 'Bordet du valt har hunnit bokas. Välj bord igen.' })
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const refused = err instanceof ApiError && err.status === 400
        setFetched((prev) =>
          // En misslyckad omhämtning (nätet) behåller listan - bokningen
          // kontrolleras ändå igen av servern.
          !refused && prev?.key === slotsKey && prev.availability
            ? prev
            : {
                key: slotsKey,
                availability: null,
                error: refused ? 'Den dagen går inte att boka online.' : bookingErrorMessage(err),
              },
        )
      })
    return () => {
      cancelled = true
    }
  }, [enabled, location.locationId, date, partySize, slotsKey, refresh, tick])

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

  const slots = availability?.slots ?? []
  const slot: AvailabilitySlot | null = slots.find((s) => s.startTime === startTime) ?? null
  // Bord som ingår i något alternativ för sällskapet - bara de går att välja.
  const free = useMemo(
    () => new Map((slot?.tables ?? []).map((t) => [t.tableId, t.seats] as const)),
    [slot],
  )
  const options = slot?.options ?? []
  const day = availability?.day ?? null
  const dayText = dayMessage(day, info.phone)
  const allTables = useMemo(
    () => (floors ?? []).flatMap((g) => g.elements.filter((e): e is LayoutTableElement => e.type === 'table')),
    [floors],
  )
  const labels = useMemo(() => labelTables(allTables), [allTables])
  const activeFloor = floors?.find((g) => g.floor?.floorId === floorId) ?? floors?.[0] ?? null

  // Byter man dag, tid eller sällskap gäller inte gamla bordsval längre.
  function choose(change: () => void) {
    change()
    setOption(null)
    setFormError(null)
    setSlotNotice(null)
  }

  function chooseDate(d: string) {
    // En annan dag har egna tider - välj tid igen.
    choose(() => {
      setDate(d)
      setStartTime(null)
    })
  }

  function choosePartySize(n: number) {
    // Ett annat sällskap får andra bord (och kanske andra tider): välj om.
    choose(() => {
      setPartySize(n)
      setStartTime(null)
    })
  }

  /** Ett klick på ett bord väljer bordet - eller, om det bara går att boka
   * tillsammans med andra, den kombination det ingår i. */
  function pickTable(tableId: string) {
    setSlotNotice(null)
    setFormError(null)
    if (option?.tableIds.includes(tableId)) {
      setOption(null)
      return
    }
    setOption(
      options.find((o) => o.tableIds.length === 1 && o.tableIds[0] === tableId) ??
        options.find((o) => o.tableIds.includes(tableId)) ??
        null,
    )
  }

  function pickOption(o: TableOption) {
    setSlotNotice(null)
    setFormError(null)
    setOption(sameTables(o, option) ? null : o)
  }

  /** Bekräfta bord: borden spärras för andra i 15 minuter. */
  async function confirmTables() {
    const problem =
      !slot ? 'Välj en tid.'
      : !option ? 'Välj ett bord.'
      : cardNeeded && !config.stripe.publishableKey
        ? `Onlinebokning för ${partySize} personer kräver kortgaranti, som inte är tillgänglig just nu. Ring oss på ${info.phone || 'restaurangen'}.`
      : turnstileSiteKey && !turnstileToken
        ? 'Bekräfta säkerhetskontrollen (rutan ovanför knappen).'
        : null
    if (problem) {
      setFormError(problem)
      return
    }
    setHolding(true)
    setFormError(null)
    setRestartNotice(null)
    try {
      const held = await holdTables(location.locationId, {
        date,
        startTime: slot!.startTime,
        tableIds: option!.tableIds,
        partySize,
        ...(turnstileToken ? { turnstileToken } : {}),
      })
      setHold(held)
      setNow(Date.now())
      setDeadline(Date.now() + held.holdMinutes * 60_000)
    } catch (err) {
      setFormError(
        !turnstileSiteKey && turnstileMissing(err)
          ? 'Sidan behöver laddas om. Ladda om sidan och försök igen.'
          : bookingErrorMessage(err),
      )
      const stale = staleSelection(err)
      if (stale) {
        // Tiden passerade 30-minutersgränsen eller bordet hann tas: välj
        // igen ur en nyhämtad lista.
        if (stale === 'time') setStartTime(null)
        setOption(null)
        setSlotNotice(null)
        setRefresh((n) => n + 1)
      }
    } finally {
      // Säkerhetskontrollens token gäller ett försök - widgeten tar fram en ny.
      if (turnstileSiteKey) {
        setTurnstileToken(null)
        setTurnstileReset((n) => n + 1)
      }
      setHolding(false)
    }
  }

  /** Byt bord: släpp de hållna borden och välj igen. */
  function changeTables() {
    if (hold) void releaseHold(location.locationId, hold).catch(() => undefined)
    setHold(null)
    setDeadline(null)
    setOption(null)
    setFormError(null)
    setRefresh((n) => n + 1)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!hold) {
      setFormError('Bekräfta ditt bord först.')
      return
    }
    const problem = guestError(guest)
    if (problem) {
      setFormError(problem)
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await createReservation(
        location.locationId,
        {
          date: hold.date,
          startTime: hold.startTime,
          tableIds: hold.tableIds,
          partySize: hold.partySize,
          name: guest.name.trim(),
          email: guest.email.trim(),
          phone: guest.phone.trim(),
          notes: guest.notes.trim() || undefined,
          language: 'sv',
          marketingOptIn: guest.marketingOptIn,
          acceptTerms: true,
          holdId: hold.holdId,
        },
        hold.manageToken,
      )
      if (result.status === 'pending' && result.setup) {
        // Kortsteget fortsätter på samma klocka.
        setPending(result)
      } else {
        setBooked(result)
        setHold(null)
        setDeadline(null)
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err instanceof ApiError && err.message === 'hold_expired') {
        restart(HOLD_EXPIRED_TEXT)
        return
      }
      setFormError(bookingErrorMessage(err))
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

  const heldTables = hold ? hold.tableIds.map((id) => labels.get(id) ?? id).join(' + ') : ''

  if (pending && !booked) {
    return (
      <>
      {hold && secondsLeft !== null && <HoldBanner secondsLeft={secondsLeft} tables={heldTables} />}
      <GuaranteeStep
        booking={pending}
        guest={{ name: guest.name.trim(), email: guest.email.trim(), phone: normalizePhone(guest.phone) }}
        locationId={location.locationId}
        publishableKey={config.stripe.publishableKey}
        returnUrl={manageLink(window.location.origin, pending, location.locationId, pending.manageToken!)}
        onConfirmed={(b) => {
          setBooked({ ...b, manageToken: pending.manageToken })
          setPending(null)
          setHold(null)
          setDeadline(null)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
      </>
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
        {booked.guarantee?.cardOnFile && (
          <p className="booking-sent">Kortgarantin är sparad - inget har dragits från kortet.</p>
        )}
        <p className="booking-sent">
          Vi skickar en bekräftelse till <strong>{guest.email.trim()}</strong> med en
          länk där du kan se och avboka din bokning.
        </p>
        {link && (
          <div className="booking-manage">
            <p>
              Du kan också spara länken här:
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
        {restartNotice && <p className="notice error" role="alert">{restartNotice}</p>}
      </section>

      <form className="booking" onSubmit={submit} noValidate>
        <fieldset className="booking-step" disabled={Boolean(hold) || holding}>
          <legend>1. När och hur många?</legend>
          <label className="booking-field">
            <span>Antal personer</span>
            <select value={partySize} onChange={(e) => choosePartySize(Number(e.target.value))}>
              {Array.from({ length: maxParty }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? 'person' : 'personer'}</option>
              ))}
            </select>
          </label>
          <p className="cell-muted">
            Fler än {maxParty}? Ring oss på {info.phone || 'restaurangen'}.
          </p>
          <div className="booking-dates" role="group" aria-label="Välj datum">
            {dates.map((d) => {
              const special = specialByDate.get(d)
              const mark =
                special?.kind === 'closed' ? 'Stängt' : special?.kind === 'no_online' ? 'Ring oss' : null
              return (
                <button
                  key={d}
                  type="button"
                  className={`filter-pill${d === date ? ' active' : ''}${mark ? ' is-special' : ''}`}
                  aria-pressed={d === date}
                  onClick={() => chooseDate(d)}
                >
                  {d === today ? 'Idag' : formatDate(d)}
                  {mark && <span className="pill-note"> · {mark}</span>}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="booking-step" disabled={Boolean(hold) || holding}>
          <legend>2. Välj tid</legend>
          {loadingSlots && <p className="notice" role="status">Hämtar lediga tider…</p>}
          {slotsError && <p className="notice error" role="alert">{slotsError}</p>}
          {!loadingSlots && dayText && <p className="notice" role="status">{dayText}</p>}
          {!loadingSlots && !slotsError && slots.length === 0 && (!day || day.kind === 'hours') && (
            <p className="notice" role="status">
              Inga lediga tider för {partySize} personer {formatDate(date)}. Prova en annan dag.
            </p>
          )}
          {slotNotice?.step === 'time' && <p className="notice" role="status">{slotNotice.text}</p>}
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
          <fieldset className="booking-step" disabled={Boolean(hold) || holding}>
            <legend>3. Välj bord</legend>
            <p className="cell-muted">
              Klicka på ett bord. Här visas bara bord som passar {partySize}{' '}
              {partySize === 1 ? 'person' : 'personer'}.
            </p>
            {slotNotice?.step === 'tables' && <p className="notice" role="status">{slotNotice.text}</p>}
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
                  <FloorPlanSvg group={activeFloor} free={free} selected={selected} onToggle={pickTable} />
                ) : (
                  <FloorPlan3D group={activeFloor} />
                )}
              </>
            )}
            <div className="booking-table-list" role="group" aria-label="Lediga bord">
              {options.map((o) => (
                <button
                  key={o.tableIds.join('+')}
                  type="button"
                  className={`filter-pill${sameTables(o, option) ? ' active' : ''}`}
                  aria-pressed={sameTables(o, option)}
                  onClick={() => pickOption(o)}
                >
                  Bord {o.tableIds.map((id) => labels.get(id) ?? id).join(' + ')} · {o.seats} pl
                </button>
              ))}
            </div>
            {option && !hold && (
              <div className="booking-confirm-tables">
                <p className="booking-summary-line" aria-live="polite">
                  {formatDate(date)} kl {slot.startTime}–{slot.endTime} · {partySize} personer · bord{' '}
                  {option.tableIds.map((id) => labels.get(id) ?? id).join(' + ')}
                </p>
                <p className="cell-muted">
                  När du bekräftar hålls bordet åt dig i 15 minuter medan du fyller i dina uppgifter.
                </p>
                {turnstileSiteKey && (
                  <TurnstileWidget
                    siteKey={turnstileSiteKey}
                    resetKey={turnstileReset}
                    onToken={setTurnstileToken}
                  />
                )}
                {formError && <p className="notice error" role="alert">{formError}</p>}
                <button type="button" className="btn-primary" disabled={holding} onClick={() => void confirmTables()}>
                  {holding ? 'Bekräftar…' : 'Bekräfta bord'}
                </button>
              </div>
            )}
          </fieldset>
        )}

        {hold && secondsLeft !== null && (
          <HoldBanner secondsLeft={secondsLeft} tables={heldTables} onChange={changeTables} />
        )}

        {hold && (
          <fieldset className="booking-step">
            <legend>4. Dina uppgifter</legend>
            <div className="booking-grid">
              <label className="booking-field">
                <span>Namn</span>
                <input autoComplete="name" maxLength={NAME_MAX} value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
              </label>
              <label className="booking-field">
                <span>E-post</span>
                <input type="email" autoComplete="email" maxLength={EMAIL_MAX} value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
              </label>
              <label className="booking-field">
                <span>Telefon</span>
                <input type="tel" autoComplete="tel" placeholder="070-123 45 67" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              </label>
              <label className="booking-field booking-field--wide">
                <span>Meddelande till restaurangen (valfritt)</span>
                <textarea maxLength={NOTES_MAX} rows={3} placeholder="Allergier, barnstol, firande…" value={guest.notes} onChange={(e) => setGuest({ ...guest, notes: e.target.value })} />
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
            {cardNeeded && terms && (
              <div className="guarantee-notice" role="note">
                <strong>Kortgaranti krävs</strong> för sällskap om {terms.minPartySize} personer eller fler.
                Inget dras nu.
                {terms.noShowFeePerPerson > 0 && ` Uteblir ni debiteras ${terms.noShowFeePerPerson} kr per person.`}
                {terms.lateCancelFeePerPerson > 0 &&
                  ` Avbokning senare än ${terms.cancelCutoffHours} timmar före kostar ${terms.lateCancelFeePerPerson} kr per person.`}
              </div>
            )}
            <div className="booking-summary-line" aria-live="polite">
              {formatDate(hold.date)} kl {hold.startTime}–{hold.endTime} · {hold.partySize} personer · bord{' '}
              {heldTables}
            </div>
            {formError && <p className="notice error" role="alert">{formError}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Bokar…' : cardNeeded ? 'Fortsätt till kortgaranti' : 'Boka bordet'}
            </button>
          </fieldset>
        )}
        {formError && !hold && !(slot && option) && (
          <p className="notice error" role="alert">{formError}</p>
        )}
      </form>
    </>
  )
}
