import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bar, Button, Field, Input } from '@booqy/brand'
import './evenemang.css'
import { acceptGift, codeOf, isNotFound, tokenFromHash } from './eventsApi'

/**
 * /biljett/ta-emot#<transferToken>: någon har gett bort en biljett. Gästen
 * skriver sitt namn (det står på biljetten och på gästlistan), tar emot
 * (K21) och kommer till sin egen biljettsida. Givarens biljett slutar gälla.
 */
export default function TaEmotPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const token = tokenFromHash(hash || (typeof window !== 'undefined' ? window.location.hash : ''))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept(e: FormEvent) {
    e.preventDefault()
    if (!token || busy) return
    setBusy(true)
    setError(null)
    try {
      const out = await acceptGift(token, name.trim())
      navigate(`/biljett#${out.ticketToken}`)
    } catch (err) {
      setError(isNotFound(err)
        ? 'Länken gäller inte längre. Biljetten kan redan ha tagits emot eller gåvan ha ångrats.'
        : codeOf(err) === 'invalid_state'
          ? 'Biljetten kan inte tas emot: gåvan har ångrats eller biljetten har redan använts.'
          : 'Det gick inte att ta emot biljetten. Försök igen.')
      setBusy(false)
    }
  }

  return (
    <section className="page-hero page-prose evenemang-page" data-bq-theme="restaurant">
      <h1>Ta emot biljett</h1>
      {!token ? (
        <p>Öppna länken i mejlet om biljetten du har fått för att ta emot den här.</p>
      ) : (
        <form className="evenemang-form" onSubmit={accept} noValidate>
          <p>Någon har gett dig en biljett. Skriv ditt namn så blir biljetten din. Namnet står på biljetten och på gästlistan i dörren.</p>
          <Field label="Ditt namn" required>
            <Input autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {error ? <Bar variant="banner" tone="danger">{error}</Bar> : null}
          <Button type="submit" variant="primary" busy={busy} busyLabel="Tar emot…" disabled={!name.trim()}>Ta emot biljetten</Button>
        </form>
      )}
    </section>
  )
}
