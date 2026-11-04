import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import { checkBalance, giftErrorMessage } from './giftApi'

const STATUS: Record<string, string> = { active: 'Kan användas', used: 'Förbrukat', expired: 'Har gått ut', void: 'Gäller inte längre' }

/** /presentkort/saldo: hur mycket finns kvar på ett presentkort. */
export default function SaldoPage() {
  const { config, location } = useSite()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ balanceOre: number; expiresAt: string; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)
  const siteKey = config.turnstile?.siteKey ?? null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await checkBalance(location.locationId, code, turnstileToken ?? undefined))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404
        ? 'Vi hittar inget presentkort med den koden. Kontrollera koden och försök igen.'
        : giftErrorMessage(err, 'Det gick inte att se saldot just nu.'))
    } finally {
      setBusy(false)
      setTurnstileReset((n) => n + 1)
    }
  }

  return (
    <section className="page-hero page-prose">
      <h1>Saldo på presentkort</h1>
      <form onSubmit={submit} noValidate>
        <div className="booking-grid">
          <label className="booking-field">
            <span>Kod (16 tecken)</span>
            <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
        </div>
        {siteKey ? <TurnstileWidget siteKey={siteKey} resetKey={turnstileReset} onToken={setTurnstileToken} /> : null}
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        <button type="submit" className="btn-primary" aria-busy={busy}
          disabled={busy || code.replace(/[\s-]/g, '').length !== 16 || Boolean(siteKey && !turnstileToken)}>
          {busy ? 'Kollar…' : 'Visa saldo'}
        </button>
      </form>
      {result ? (
        <p className="notice" role="status">
          Kvar: <strong>{(result.balanceOre / 100).toLocaleString('sv-SE')} kr</strong>. {STATUS[result.status] ?? ''}
          {result.status === 'active' ? `, gäller till och med ${result.expiresAt.slice(0, 10)}.` : '.'}
        </p>
      ) : null}
      <p><Link to="/presentkort">Köp ett presentkort</Link></p>
    </section>
  )
}
