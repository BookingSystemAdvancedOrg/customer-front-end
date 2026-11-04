import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../shared/api'
import { PhoneInput } from '../../shared/PhoneInput'
import { toE164 } from '../../shared/phone'
import { useSite } from '../../shared/SiteContext'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import {
  ERRORS,
  acceptTable,
  clock,
  joinQueue,
  leaveQueue,
  newEntryId,
  queueStatus,
  storeToken,
  storedToken,
  type QueueStatus,
} from './koApi'

const REFRESH_MS = 20_000

function message(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const code = String(err.body.code ?? err.body.error ?? '')
    if (ERRORS[code]) return ERRORS[code]
    if (err.status === 404) return 'Kön finns inte längre. Fråga personalen.'
  }
  return fallback
}

/** /ko och /ko#<token>: ställ dig i kö, se din plats, ta bordet eller lämna kön. */
export default function KoPage() {
  const { config, location } = useSite()
  const fromHash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
  const [token, setToken] = useState<string | null>(fromHash || storedToken(location.locationId))
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [booked, setBooked] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      setStatus(await queueStatus(token))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        storeToken(location.locationId, null)
        setToken(null)
        setStatus(null)
      }
    }
  }, [token, location.locationId])

  useEffect(() => {
    if (!token) return
    storeToken(location.locationId, token)
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [token, refresh, location.locationId])

  if (!config.tenant.features?.waitlist || !location.waitlist?.publicJoin) {
    return (
      <section className="page-hero page-prose">
        <h1>Kö</h1>
        <p>{location.name} har ingen kö via hemsidan just nu. <Link to="/boka-bord">Boka bord</Link> eller ring oss.</p>
      </section>
    )
  }

  async function act(fn: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(message(err, fallback))
    } finally {
      setBusy(false)
    }
  }

  if (token && status) {
    const offered = status.status === 'offered' && status.offer
    return (
      <section className="page-hero page-prose" aria-live="polite">
        <h1>Din plats i kön</h1>
        {status.status === 'waiting' ? (
          <p>Du är nummer <strong>{status.position}</strong> i kön hos {status.locationName}. Vi sms:ar när ditt bord är klart.</p>
        ) : null}
        {offered ? (
          <>
            <p className="notice" role="status">Ditt bord är klart kl. {status.offer!.startTime}! Bekräfta senast {clock(status.offer!.expiresAt)}.</p>
            <button type="button" className="btn-primary" disabled={busy} aria-busy={busy}
              onClick={() => void act(async () => { await acceptTable(token); setBooked(true); await refresh() }, 'Det gick inte att ta bordet.')}>
              {busy ? 'Skickar…' : 'Ta bordet'}
            </button>
          </>
        ) : null}
        {status.status === 'booked' || booked ? <p className="notice" role="status">Bordet är ditt. Välkommen in!</p> : null}
        {status.status === 'seated' ? <p>Du har fått ett bord. Välkommen!</p> : null}
        {status.status === 'expired' ? <p>{ERRORS.hold_expired}</p> : null}
        {status.status === 'left' || status.status === 'removed' ? <p>Du står inte längre i kön.</p> : null}
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        {status.status === 'waiting' || offered ? (
          <button type="button" className="btn-secondary btn-small" disabled={busy}
            onClick={() => void act(async () => { await leaveQueue(token); await refresh() }, 'Det gick inte att lämna kön.')}>
            Lämna kön
          </button>
        ) : null}
      </section>
    )
  }

  return <JoinForm onJoined={(t) => { window.location.hash = t; setToken(t) }} />
}

function JoinForm({ onJoined }: { onJoined: (token: string) => void }) {
  const { config, location } = useSite()
  const [entryId] = useState(newEntryId)
  const [name, setName] = useState('')
  const [party, setParty] = useState(2)
  const [phone, setPhone] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const siteKey = config.turnstile?.siteKey ?? null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const out = await joinQueue(location.locationId, {
        entryId, name: name.trim(), partySize: party, phone: toE164(phone),
        ...(turnstileToken ? { turnstileToken } : {}),
      })
      onJoined(out.token)
    } catch (err) {
      setError(message(err, 'Det gick inte att ställa dig i kö. Försök igen.'))
      setTurnstileReset((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page-hero page-prose">
      <h1>Ställ dig i kö</h1>
      <p>Alla bord hos {location.name} är upptagna just nu. Ställ dig i kö så sms:ar vi när ett bord blir ledigt i dag.</p>
      <form onSubmit={submit} noValidate>
        <div className="booking-grid">
          <label className="booking-field">
            <span>Namn</span>
            <input autoComplete="name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="booking-field">
            <span>Antal personer</span>
            <select value={party} onChange={(e) => setParty(Number(e.target.value))}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="booking-field">
            <span>Mobilnummer</span>
            <PhoneInput value={phone} onChange={setPhone} />
          </label>
        </div>
        <p className="guest-notice">
          Vi använder ditt namn och mobilnummer för att hålla din plats i kön och sms:a när bordet är klart.
          Uppgifterna raderas 30 dagar efter dagen. {config.tenant.name} är personuppgiftsansvarig.{' '}
          <Link to="/integritetspolicy" target="_blank" rel="noopener">Läs integritetspolicyn</Link>
        </p>
        {siteKey ? <TurnstileWidget siteKey={siteKey} resetKey={turnstileReset} onToken={setTurnstileToken} /> : null}
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        <button type="submit" className="btn-primary" aria-busy={busy}
          disabled={busy || !name.trim() || !phone.trim() || Boolean(siteKey && !turnstileToken)}>
          {busy ? 'Skickar…' : 'Ställ mig i kö'}
        </button>
      </form>
    </section>
  )
}
