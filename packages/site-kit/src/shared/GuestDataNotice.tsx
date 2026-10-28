import { Link } from 'react-router-dom'
import { useSite } from './SiteContext'

export type NoticeKind = 'booking' | 'order' | 'catering'

/** Lagringstider om backend inte skickar några (äldre version). */
const FALLBACK = { bookingMonths: 13, guestMonths: 24, cancelledMonths: 12, accountingYears: 7 }

/**
 * Kort information under gästformulären: vilka uppgifter, varför, hur länge,
 * vem som ansvarar, och länk till restaurangens integritetspolicy. Ren
 * information, inget att kryssa i (rättslig grund: avtal eller åtgärder
 * före avtal, docs/privacy.md).
 */
export function GuestDataNotice({ kind }: { kind: NoticeKind }) {
  const { config } = useSite()
  const r = config.privacy?.retention ?? FALLBACK
  const name = config.tenant.name
  const what = {
    booking:
      `Vi använder ditt namn, din e-post och ditt telefonnummer för att hantera bokningen och skicka ` +
      `bekräftelse, påminnelse och ändringar. Uppgifterna raderas cirka ${r.bookingMonths} månader efter besöket.`,
    order:
      `Vi använder ditt namn, din e-post och ditt telefonnummer för att laga och lämna ut beställningen och ` +
      `skicka kvitto. Namn och kontaktuppgifter tas bort efter ${r.guestMonths} månader. Kvittot sparas i ` +
      `${r.accountingYears} år enligt bokföringslagen.`,
    catering:
      `Vi använder dina kontaktuppgifter för att ta fram en offert och höra av oss om den. Blir det ingen ` +
      `beställning raderas förfrågan efter ${r.cancelledMonths} månader, annars tas kontaktuppgifterna bort ` +
      `efter ${r.guestMonths} månader.`,
  }[kind]
  return (
    <p className="guest-notice">
      {what} {name} är personuppgiftsansvarig. Inget sparas förrän du skickar.{' '}
      <Link to="/integritetspolicy" target="_blank" rel="noopener">
        Läs integritetspolicyn
      </Link>
    </p>
  )
}
