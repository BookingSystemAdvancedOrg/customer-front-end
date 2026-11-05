import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import QRCode from 'qrcode'
import { Bar, Button, Card, Chip, Field, Input, LinkButton } from '@booqy/brand'
import type { ChipTone } from '@booqy/brand'
import './evenemang.css'
import { useSite } from '../../shared/SiteContext'
import {
  cancelGift,
  eventsErrorMessage,
  getTickets,
  giveTicket,
  isNotFound,
  isTicketPage,
  newId,
  passUrl,
  time,
  tokenFromHash,
  when,
  type TicketPageData,
  type TicketStatus,
  type TicketView,
} from './eventsApi'

type Load = { kind: 'loading' } | { kind: 'ready'; data: TicketPageData } | { kind: 'missing' } | { kind: 'error' }

const STATUS: Record<TicketStatus, { label: string; tone: ChipTone }> = {
  valid: { label: 'Giltig', tone: 'success' },
  checked_in: { label: 'Insläppt', tone: 'info' },
  transferred: { label: 'Överlåten', tone: 'neutral' },
  refunded: { label: 'Återbetald', tone: 'warning' },
  void: { label: 'Ogiltig', tone: 'danger' },
}

/**
 * /biljett#<token>: biljetterna från mejlet (K18), en biljett per kort med
 * QR-koden och koden i text för dörren. Den som har länken kan visa
 * biljetterna. En giltig biljett kan ges bort till en e-postadress (K20)
 * fram till två timmar före start, och gåvan kan ångras tills mottagaren har
 * tagit emot den (K22). Andrahandsförsäljning och Wallet-pass är inte byggda
 * än: Wallet-länkarna visas bara när servern säger att de finns.
 */
export default function BiljettPage() {
  const { hash } = useLocation()
  const token = tokenFromHash(hash || (typeof window !== 'undefined' ? window.location.hash : ''))
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!token) return
    let live = true
    getTickets(token)
      .then((d) => live && setLoad(isTicketPage(d) ? { kind: 'ready', data: d } : { kind: 'missing' }))
      .catch((err) => live && setLoad(isNotFound(err) ? { kind: 'missing' } : { kind: 'error' }))
    return () => {
      live = false
    }
  }, [token, reloadKey])

  const reload = useCallback(() => setReloadKey((n) => n + 1), [])

  if (!token || load.kind !== 'ready') {
    return (
      <section className="page-hero page-prose evenemang-page" data-bq-theme="restaurant">
        <h1>Dina biljetter</h1>
        {!token ? <p>Öppna länken i mejlet med dina biljetter för att visa dem här.</p> : null}
        {token && load.kind === 'loading' ? <p className="cell-muted" role="status">Hämtar biljetterna…</p> : null}
        {token && load.kind === 'missing' ? <p>Länken gäller inte. Kontrollera att du har öppnat hela länken från mejlet.</p> : null}
        {token && load.kind === 'error' ? (
          <Bar variant="banner" tone="danger">Biljetterna gick inte att hämta just nu. Ladda om sidan om en stund.</Bar>
        ) : null}
      </section>
    )
  }
  return <Tickets token={token} data={load.data} onChanged={reload} />
}

function Tickets({ token, data, onChanged }: { token: string; data: TicketPageData; onChanged: () => void }) {
  const { location } = useSite()
  const tz = location.timezone
  const { event, occurrence } = data
  const cancelled = occurrence.status === 'cancelled'
  return (
    <section className="page-hero page-prose evenemang-page" data-bq-theme="restaurant">
      <h1>Dina biljetter</h1>
      <p className="evenemang-ticket-head">
        <strong>{event.title}</strong>
        <span>{when(occurrence.startAt, tz)}</span>
        {occurrence.doorsAt ? <span>{`Insläpp från kl. ${time(occurrence.doorsAt, tz)}`}</span> : null}
        {data.location?.name ? <span>{data.location.name}</span> : null}
      </p>
      {cancelled ? (
        <Bar variant="banner" tone="warning">Tillfället är inställt. Restaurangen återbetalar biljetterna och skickar besked via e-post.</Bar>
      ) : (
        <p className="cell-muted">Visa QR-koden i dörren. Skruva gärna upp skärmens ljusstyrka.</p>
      )}
      <ul className="evenemang-tickets">
        {data.tickets.map((t, i) => (
          <li key={t.ticketId}>
            <TicketCard token={token} ticket={t} n={i + 1} count={data.tickets.length} data={data} onChanged={onChanged} />
          </li>
        ))}
      </ul>
      {event.refundPolicy ? (
        <>
          <h2>Återbetalning</h2>
          <p>{event.refundPolicy}</p>
        </>
      ) : null}
    </section>
  )
}

function useQr(payload: string | undefined): string | null {
  const [qr, setQr] = useState<{ payload: string; src: string } | null>(null)
  useEffect(() => {
    if (!payload) return
    let live = true
    QRCode.toDataURL(payload, { margin: 0, width: 320, errorCorrectionLevel: 'M' })
      .then((src) => live && setQr({ payload, src }))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [payload])
  return payload && qr?.payload === payload ? qr.src : null
}

function TicketCard({ token, ticket, n, count, data, onChanged }: {
  token: string; ticket: TicketView; n: number; count: number; data: TicketPageData; onChanged: () => void
}) {
  const qrSrc = useQr(ticket.status === 'valid' ? ticket.qr : undefined)
  const status = STATUS[ticket.status] ?? STATUS.void
  const title = `${ticket.typeName || 'Biljett'}${count > 1 ? ` (${n} av ${count})` : ''}`
  const showQr = ticket.status === 'valid' && Boolean(ticket.qr)
  return (
    <Card surface="ticket" level={2} title={title} actions={<Chip tone={status.tone}>{status.label}</Chip>}
      qr={showQr && qrSrc ? <img src={qrSrc} alt={`QR-kod för ${title}`} width={196} height={196} /> : undefined}
      code={showQr ? ticket.qr : undefined}>
      {ticket.holderName ? <p className="evenemang-ticket-line">{`Namn: ${ticket.holderName}`}</p> : null}
      {ticket.status === 'checked_in' ? <p className="evenemang-ticket-line">Biljetten har redan använts i dörren.</p> : null}
      {ticket.status === 'transferred' ? <p className="evenemang-ticket-line">Biljetten har getts bort och gäller inte längre här.</p> : null}
      {ticket.status === 'refunded' ? <p className="evenemang-ticket-line">Biljetten är återbetald och gäller inte längre.</p> : null}
      {ticket.status === 'void' ? <p className="evenemang-ticket-line">Biljetten gäller inte.</p> : null}
      {ticket.status === 'valid' && (data.wallet.apple || data.wallet.google) ? (
        <p className="evenemang-actions">
          {data.wallet.apple ? <LinkButton size="sm" href={passUrl(token, ticket.ticketId, 'apple')}>Lägg till i Apple Wallet</LinkButton> : null}
          {data.wallet.google ? <LinkButton size="sm" href={passUrl(token, ticket.ticketId, 'google')}>Spara i Google Wallet</LinkButton> : null}
        </p>
      ) : null}
      {ticket.status === 'valid' ? <Gift token={token} ticket={ticket} open={data.transferAllowed} onChanged={onChanged} /> : null}
    </Card>
  )
}

/** Ge bort biljetten (K20) eller ångra en gåva som inte är mottagen (K22). */
function Gift({ token, ticket, open, onChanged }: { token: string; ticket: TicketView; open: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [toEmail, setToEmail] = useState('')
  const [transferId, setTransferId] = useState(newId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function give(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await giveTicket(token, { transferId, ticketId: ticket.ticketId, toEmail: toEmail.trim() })
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(eventsErrorMessage(err, 'Det gick inte att ge bort biljetten. Försök igen.'))
      setTransferId(newId())
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    if (!ticket.pendingTransferId || busy) return
    setBusy(true)
    setError(null)
    try {
      await cancelGift(token, ticket.pendingTransferId)
      onChanged()
    } catch (err) {
      setError(eventsErrorMessage(err, 'Det gick inte att ångra gåvan. Försök igen.'))
    } finally {
      setBusy(false)
    }
  }

  if (ticket.pendingTransferId) {
    return (
      <div className="evenemang-gift">
        <p className="evenemang-ticket-line">Biljetten är på väg till mottagaren. Den gäller här tills gåvan har tagits emot.</p>
        {error ? <Bar variant="banner" tone="danger">{error}</Bar> : null}
        <Button size="sm" busy={busy} busyLabel="Ångrar…" onClick={undo}>Ångra gåvan</Button>
      </div>
    )
  }
  if (!open) {
    return <p className="cell-muted evenemang-ticket-line">Biljetten kan inte ges bort (det går fram till två timmar före start, om restaurangen tillåter det).</p>
  }
  if (!editing) {
    return (
      <div className="evenemang-gift">
        <Button size="sm" onClick={() => setEditing(true)}>Ge bort biljetten</Button>
      </div>
    )
  }
  return (
    <form className="evenemang-gift" onSubmit={give} noValidate>
      <Field label="Mottagarens e-post" required hint="Mottagaren får ett mejl med en länk och skriver in sitt namn. Din biljett slutar då gälla.">
        <Input type="email" autoComplete="off" value={toEmail} onChange={(e) => setToEmail(e.target.value)} />
      </Field>
      {error ? <Bar variant="banner" tone="danger">{error}</Bar> : null}
      <p className="evenemang-actions">
        <Button type="submit" size="sm" variant="primary" busy={busy} busyLabel="Skickar…" disabled={!toEmail.trim()}>Skicka biljetten</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(null) }}>Avbryt</Button>
      </p>
    </form>
  )
}

