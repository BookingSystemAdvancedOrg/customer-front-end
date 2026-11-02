import { useSite } from '../../shared/SiteContext'

/** /evenemang. Funktionen Evenemang och biljetter ersätter innehållet. */
export default function EvenemangPage() {
  const { config } = useSite()
  return (
    <section className="page-hero page-prose">
      <h1>Evenemang</h1>
      <p>Snart kan du se evenemang hos {config.tenant.name} och köpa biljetter här.</p>
    </section>
  )
}
