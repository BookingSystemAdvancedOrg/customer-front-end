import { MachineTranslationNote } from '../../shared/lang/MachineTranslationNote'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { bookingTerms } from '../../shared/bookingTerms'
import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'
import { formatPhoneNational, phoneHref } from '../../shared/phone'

/**
 * Bokningsvillkor för den valda platsen, byggda från dess riktiga
 * kortgaranti och tid för sen ankomst (shared/bookingTerms.ts). Utan
 * kortgaranti visas den enkla versionen. Juridisk granskning:
 * application/docs/booking-terms-legal-review.md.
 */
/** Numret i texten som en tel:-länk som aldrig bryts vid bindestrecket. */
function withPhoneLink(item: string, phone: string, href: string): ReactNode {
  if (!phone || !item.includes(phone)) return item
  return item.split(phone).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <a href={href} style={{ whiteSpace: 'nowrap' }}>{phone}</a>}
      {part}
    </Fragment>
  ))
}

export default function TermsPage() {
  const { config, location } = useSite()
  const info = useLocationInfo()
  const phone = formatPhoneNational(info.phone)
  const sections = bookingTerms(location.guarantee ?? null, {
    legalName: config.legal.legalName,
    graceMinutes: location.gracePeriodMinutes,
    phone,
    email: info.email,
  })
  return (
    <article className="page-prose">
      <h1>Bokningsvillkor</h1>
      <MachineTranslationNote />
      <p className="cell-muted">
        {config.legal.legalName} · {info.name}
        {config.legal.orgNumber ? ` · Org.nr ${config.legal.orgNumber}` : ''}
      </p>
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`villkor-${s.id}`}>
          <h2 id={`villkor-${s.id}`}>{s.heading}</h2>
          <ul>
            {s.items.map((item) => <li key={item}>{withPhoneLink(item, phone, phoneHref(info.phone))}</li>)}
          </ul>
          {s.id === 'personuppgifter' && (
            <p><Link to="/integritetspolicy">Läs integritetspolicyn</Link></p>
          )}
        </section>
      ))}
    </article>
  )
}
