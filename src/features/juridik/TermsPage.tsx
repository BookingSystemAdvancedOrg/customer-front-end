import { Link } from 'react-router-dom'
import { bookingTerms } from '../../shared/bookingTerms'
import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'

/**
 * Bokningsvillkor för den valda platsen, byggda från dess riktiga
 * kortgaranti och tid för sen ankomst (shared/bookingTerms.ts). Utan
 * kortgaranti visas den enkla versionen. Juridisk granskning:
 * application/docs/booking-terms-legal-review.md.
 */
export default function TermsPage() {
  const { config, location } = useSite()
  const info = useLocationInfo()
  const sections = bookingTerms(location.guarantee ?? null, {
    legalName: config.legal.legalName,
    graceMinutes: location.gracePeriodMinutes,
    phone: info.phone,
    email: info.email,
  })
  return (
    <article className="page-prose">
      <h1>Bokningsvillkor</h1>
      <p className="cell-muted">
        {config.legal.legalName} · {info.name}
        {config.legal.orgNumber ? ` · Org.nr ${config.legal.orgNumber}` : ''}
      </p>
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`villkor-${s.id}`}>
          <h2 id={`villkor-${s.id}`}>{s.heading}</h2>
          <ul>
            {s.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {s.id === 'personuppgifter' && (
            <p><Link to="/integritetspolicy">Läs integritetspolicyn</Link></p>
          )}
        </section>
      ))}
    </article>
  )
}
