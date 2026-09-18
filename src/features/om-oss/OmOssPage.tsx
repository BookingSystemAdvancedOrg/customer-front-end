import { Link } from 'react-router-dom'
import { RESTAURANT } from '../../shared/restaurant'
import hero from '../../assets/hero.svg'

/**
 * Om oss (nav-punkten i Figma-designen — sidan i sig finns inte bland
 * skärmarna, så den återanvänder sajtens hero-upplägg med öppettider och
 * kontakt tills en design finns).
 */
export default function OmOssPage() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="hero-kicker">Välkommen</p>
          <h1>{RESTAURANT.name}</h1>
          <p className="hero-lead">{RESTAURANT.tagline}</p>
          <div className="hero-actions">
            <Link to="/meny" className="btn primary">
              Se vår meny
            </Link>
            <Link to="/boka-bord" className="btn ghost">
              Boka bord
            </Link>
          </div>
        </div>
        <img className="hero-photo" src={hero} alt="" />
      </section>

      <section className="info-grid" aria-label="Öppettider och kontakt">
        <div className="info-card">
          <h2>Öppettider</h2>
          <ul className="hours-list">
            {RESTAURANT.openingHours.map((row) => (
              <li key={row.days}>
                <span className="days">{row.days}</span>
                <span>{row.hours}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="info-card">
          <h2>Hitta hit</h2>
          <p>{RESTAURANT.address}</p>
        </div>
        <div className="info-card">
          <h2>Kontakt</h2>
          <p>{RESTAURANT.phone}</p>
          <p>{RESTAURANT.email}</p>
        </div>
      </section>
    </>
  )
}
