import { useSite } from '../../shared/SiteContext'

/** Varje sida på en sajt från webbplatsbyggaren. Webbplatsbyggaren ersätter innehållet med sidorna i dokumentet. */
export default function BuilderPage() {
  const { config } = useSite()
  return (
    <section className="page-hero page-prose">
      <h1>{config.tenant.name}</h1>
      <p>Den här sidan är på väg.</p>
    </section>
  )
}
