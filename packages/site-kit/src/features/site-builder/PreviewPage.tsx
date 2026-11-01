/** /forhandsvisning, aldrig indexerad. Webbplatsbyggaren ersätter innehållet. */
export default function PreviewPage() {
  return (
    <section className="page-hero page-prose">
      <meta name="robots" content="noindex" />
      <h1>Förhandsvisning</h1>
      <p>Det finns ingen förhandsvisning att visa just nu.</p>
    </section>
  )
}
