import { Link } from 'react-router-dom'

/** /evenemang/:eventId. Funktionen Evenemang och biljetter ersätter innehållet. */
export default function EvenemangDetaljPage() {
  return (
    <section className="page-hero page-prose">
      <h1>Evenemang</h1>
      <p>Snart kan du läsa om evenemanget och köpa biljetter här.</p>
      <p><Link to="/evenemang">Alla evenemang</Link></p>
    </section>
  )
}
