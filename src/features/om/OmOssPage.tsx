import { useSite } from '../../shared/SiteContext'

/** Om oss: restaurangens egen text (varumärkesinställningen "about"). */
export default function OmOssPage() {
  const { config } = useSite()
  const about = config.tenant.branding.about?.trim()
  return (
    <section className="page-hero page-prose">
      <h1>Om {config.tenant.name}</h1>
      {about ? (
        about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)
      ) : (
        <p>Välkommen till {config.tenant.name}.</p>
      )}
    </section>
  )
}
