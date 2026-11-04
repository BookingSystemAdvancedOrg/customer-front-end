import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Button } from '@booqy/brand'
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
    <section className="page-hero page-prose" data-bq-theme="restaurant">
      <h1>Saldo på presentkort</h1>
      <form onSubmit={submit} noValidate>
        <div className="booking-grid">
          <label className="booking-field">
            <span>Kod (16 tecken)</span>
            <input autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
        </div>
        {siteKey ? <TurnstileWidget siteKey={siteKey} resetKey={turnstileReset} onToken={setTurnstileToken} /> : null}
        {error ? <Bar variant="banner" tone="danger">{error}</Bar> : null}
        <Button type="submit" variant="primary" busy={busy} busyLabel="Kollar…"
          disabled={code.replace(/[\s-]/g, '').length !== 16 || Boolean(siteKey && !turnstileToken)}>
          Visa saldo
        </Button>
      </form>
      {result ? (
        <Bar variant="banner" tone={result.status === 'active' ? 'success' : 'warning'}>
          Kvar: <strong>{(result.balanceOre / 100).toLocaleString('sv-SE')} kr</strong>. {STATUS[result.status] ?? ''}
          {result.status === 'active' ? `, gäller till och med ${result.expiresAt.slice(0, 10)}.` : '.'}
        </Bar>
      ) : null}
      <p><Link to="/presentkort">Köp ett presentkort</Link></p>
    </section>
  )
}
