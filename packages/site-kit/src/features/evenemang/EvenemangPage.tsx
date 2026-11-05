import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Chip } from '@booqy/brand'
import './evenemang.css'
import { useSite } from '../../shared/SiteContext'
import { isNotFound, kr, listEvents, when, type PublicEventSummary } from './eventsApi'

type State = { kind: 'loading' } | { kind: 'ready'; events: PublicEventSummary[] } | { kind: 'error' }

/**
 * /evenemang: restaurangens kommande evenemang (K15), närmaste först. Utan
 * funktionen svarar API:t 404 och sidan visar bara att inget finns.
 */
export default function EvenemangPage() {
  const { config, location } = useSite()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    listEvents(location.locationId)
      .then((out) => live && setState({ kind: 'ready', events: Array.isArray(out?.events) ? out.events : [] }))
      .catch((err) => live && setState(isNotFound(err) ? { kind: 'ready', events: [] } : { kind: 'error' }))
    return () => {
      live = false
    }
  }, [location.locationId])

  return (
    <section className="page-hero page-prose evenemang-page" data-bq-theme="restaurant">
      <h1>Evenemang</h1>
      {state.kind === 'loading' ? <p className="cell-muted" role="status">Hämtar evenemang…</p> : null}
      {state.kind === 'error' ? (
        <Bar variant="banner" tone="danger">Evenemangen gick inte att hämta just nu. Ladda om sidan om en stund.</Bar>
      ) : null}
      {state.kind === 'ready' && state.events.length === 0 ? (
        <p>{config.tenant.name} har inga evenemang till salu just nu. Titta in igen snart.</p>
      ) : null}
      {state.kind === 'ready' && state.events.length > 0 ? (
        <>
          <p>Quiz, vinmiddagar och andra kvällar hos {config.tenant.name}. Välj ett evenemang för att köpa biljetter.</p>
          <ul className="evenemang-list">
            {state.events.map((ev) => (
              <li key={ev.eventId} className="evenemang-item">
                <h2 className="evenemang-item__title">
                  <Link to={`/evenemang/${encodeURIComponent(ev.eventId)}`}>{ev.title}</Link>
                </h2>
                <p className="evenemang-item__when">{when(ev.nextOccurrence, location.timezone)}</p>
                <p className="evenemang-item__meta">
                  {ev.soldOut ? <Chip tone="warning">Slutsålt</Chip> : <span>{ev.fromPriceSek > 0 ? `Från ${kr(ev.fromPriceSek)}` : 'Gratis'}</span>}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
