import { Link } from 'react-router-dom'
import { Menu, openStatus, useSite } from '@booqy/site-kit'

/**
 * Startsidan: restaurangen (namn, tagline, öppet just nu, foto eller
 * restaurangens färg) med de två viktigaste knapparna, Beställ och Boka
 * bord, och sedan hela menyn (site-kit:s Menu).
 */
export default function MenyPage() {
  const { config, location } = useSite()
  const { tenant } = config
  const status = openStatus(location.businessHours ?? {}, location.specialDays ?? [], location.timezone ?? 'Europe/Stockholm')
  const canOrder = Boolean(tenant.features.ordering && location.ordering?.pickup)
  const canBook = Boolean(tenant.features.reservations)

  return (
    <>
      <section className={`home-hero${tenant.branding.heroImageUrl ? ' home-hero--photo' : ''}`}>
        {tenant.branding.heroImageUrl && <img className="home-hero-img" src={tenant.branding.heroImageUrl} alt="" />}
        <div className="home-hero-body">
          <h1>{location.name && config.locations.length > 1 ? location.name : tenant.name}</h1>
          {tenant.branding.tagline && <p className="home-hero-tagline">{tenant.branding.tagline}</p>}
          <p className={`home-hero-status${status.open ? ' is-open' : ''}`}>
            <span className="open-chip-dot" aria-hidden="true" />
            {status.text}
            {location.address ? <span className="home-hero-address"> · {location.address}</span> : null}
          </p>
          {(canOrder || canBook) && (
            <div className="home-hero-actions">
              {canOrder && (
                <Link className="action action--primary" to="/bestall">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
                  Beställ mat
                </Link>
              )}
              {canBook && (
                <Link className={`action${canOrder ? ' action--secondary' : ' action--primary'}`} to="/boka-bord">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" /><circle cx="12" cy="3.5" r="1.5" /><circle cx="12" cy="20.5" r="1.5" /><circle cx="3.5" cy="12" r="1.5" /><circle cx="20.5" cy="12" r="1.5" /></svg>
                  Boka bord
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <Menu />
    </>
  )
}
