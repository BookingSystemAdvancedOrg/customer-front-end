import { Link } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'

/** /presentkort. Funktionen Presentkort ersätter innehållet. */
export default function PresentkortPage() {
  const { config } = useSite()
  return (
    <section className="page-hero page-prose">
      <h1>Presentkort</h1>
      <p>Snart kan du köpa presentkort till {config.tenant.name} här.</p>
      <p><Link to="/presentkort/saldo">Se saldot på ett presentkort</Link></p>
    </section>
  )
}
