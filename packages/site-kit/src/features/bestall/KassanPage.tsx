import { Link } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'

/**
 * Dit en gammal QR-kod på bordet leder. Beställning och betalning vid bordet
 * finns inte längre (den kräver ett certifierat kassasystem): gästen beställer
 * och betalar i restaurangens kassa. Inget beställningsformulär, bara vägen
 * vidare till menyn och bokningen.
 */
export default function KassanPage() {
  const { config } = useSite()
  const reservations = Boolean(config.tenant.features.reservations)
  return (
    <section className="page-hero page-prose">
      <h1>Beställ och betala i kassan</h1>
      <p>Gå till kassan i restaurangen, så hjälper personalen dig.</p>
      <div className="home-hero-actions">
        <Link className="btn btn-primary" to="/meny">Se menyn</Link>
        {reservations && <Link className="btn btn-secondary" to="/boka-bord">Boka bord</Link>}
      </div>
    </section>
  )
}
