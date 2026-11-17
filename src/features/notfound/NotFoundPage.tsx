import { Link } from 'react-router-dom'

/**
 * Okänd adress (felstavad eller gammal länk): säger det rakt ut och visar
 * vägen vidare, bara till sidor restaurangen har.
 */
export default function NotFoundPage({ reservations, events }: { reservations: boolean; events: boolean }) {
  return (
    <section className="page-hero page-prose">
      <h1>Sidan finns inte</h1>
      <p>Adressen kan vara felstavad eller gammal. Här hittar du vidare:</p>
      <div className="home-hero-actions">
        <Link className="btn btn-primary" to="/meny">Meny</Link>
        {reservations && <Link className="btn btn-secondary" to="/boka-bord">Boka bord</Link>}
        {events && <Link className="btn btn-secondary" to="/evenemang">Evenemang</Link>}
      </div>
    </section>
  )
}
