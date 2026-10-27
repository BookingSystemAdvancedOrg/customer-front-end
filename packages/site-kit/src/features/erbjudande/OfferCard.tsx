import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { OFFER_CARD_KEY } from '../../shared/storageRegistry'
import { trackOfferView } from '../../shared/visits'
import { validEmail } from '../boka/bookingApi'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import { kronor } from '../bestall/orderApi'
import { getOffer, offerAllowedOn, signUp, signupErrorMessage } from './offerApi'
import type { Offer } from './offerApi'

type Memory = 'closed' | 'claimed' | null
type View = 'hidden' | 'open' | 'tab'

function readMemory(): Memory {
  try {
    const v = sessionStorage.getItem(OFFER_CARD_KEY)
    return v === 'closed' || v === 'claimed' ? v : null
  } catch {
    return null
  }
}

function remember(value: Exclude<Memory, null>): void {
  try {
    sessionStorage.setItem(OFFER_CARD_KEY, value)
  } catch {
    // Utan lagring visas kortet bara igen vid nästa sidladdning.
  }
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isPhone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches
}

/**
 * Välkomsterbjudandet: en rabattkupong som glider upp i hörnet efter en
 * stund (eller när besökaren scrollat en bit), aldrig på bokning, beställning
 * eller kassan. Gästen lämnar e-post, kryssar i att hen vill ha erbjudanden
 * och får koden i mejlet. Stängt eller taget kortet visas inte igen under
 * besöket. Inga cookies; bara gästens eget val (stängt/tagit) sparas i
 * fliken (sessionStorage, se registret). Att kortet visats sparas inte.
 */
export function OfferCard() {
  const { config, location } = useSite()
  const { pathname } = useLocation()
  const enabled = Boolean(config.tenant.features.marketing)
  const locationId = location.locationId
  const [offer, setOffer] = useState<Offer | null>(null)
  const [state, setView] = useState<View>('hidden')
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [reset, setReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [touched, setTouched] = useState(false)
  const counted = useRef(false)
  const titleId = useId()
  const siteKey = config.turnstile?.siteKey ?? null

  useEffect(() => {
    if (!enabled || !locationId) return
    let cancelled = false
    getOffer(locationId)
      .then((o) => !cancelled && setOffer(o))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, locationId])

  // Byte av sida: ett öppet kort som ingen rört blir en liten flik
  // ("en gång per besök") eller göms och visas igen på nästa sida.
  const moved = state === 'open' && openedOn !== null && openedOn !== pathname && !touched && !done
  const view: View = moved ? (offer?.frequency === 'visit' ? 'tab' : 'hidden') : state

  const show = useCallback(() => {
    if (!offer) return
    setView('open')
    setOpenedOn(pathname)
    setExpanded(!isPhone())
    if (!counted.current) {
      // Bara i minnet: att kortet visats sparas inte (bara gästens egna val).
      counted.current = true
      trackOfferView(locationId)
    }
  }, [offer, locationId, pathname])

  // Visa efter fördröjningen eller när besökaren scrollat tillräckligt.
  useEffect(() => {
    if (!offer || view !== 'hidden') return
    if (!offerAllowedOn(pathname, offer.pages)) return
    if (!offer.showOnMobile && isPhone()) return
    const memory = readMemory()
    if (memory === 'closed' || memory === 'claimed') return
    if (offer.frequency === 'visit' && counted.current) return
    let fired = false
    const fire = () => {
      if (fired) return
      fired = true
      show()
    }
    const timer = window.setTimeout(fire, Math.max(1, offer.delaySeconds) * 1000)
    const onScroll = () => {
      if (!offer.scrollPercent) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max > 0 && (window.scrollY / max) * 100 >= offer.scrollPercent) fire()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [offer, view, pathname, show])

  const close = useCallback(() => {
    setView('hidden')
    remember(done ? 'claimed' : 'closed')
  }, [done])

  useEffect(() => {
    if (view !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      const card = document.getElementById(titleId)?.closest('.offer-card')
      if (e.key === 'Escape' && card?.contains(document.activeElement)) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, close, titleId])

  if (!offer || view === 'hidden' || !offerAllowedOn(pathname, offer.pages)) return null

  const terms = [
    'Gäller en gång',
    offer.minOrderOre ? `vid beställning för minst ${kronor(offer.minOrderOre)}` : null,
    `koden gäller i ${offer.validDays} dagar`,
  ].filter(Boolean).join(', ')

  if (view === 'tab') {
    return (
      <button type="button" className="offer-tab"
        onClick={() => {
          setTouched(true)
          setView('open')
          setOpenedOn(pathname)
        }}
        aria-label={`Öppna erbjudandet: ${offer.percent} % rabatt`}>
        <span aria-hidden="true">{offer.percent} %</span>
      </button>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validEmail(email)) return setError('Fyll i en giltig e-postadress.')
    if (!consent) return setError('Kryssa i att du vill få erbjudanden, så kan vi skicka koden.')
    if (siteKey && !token) return setError('Bekräfta säkerhetskontrollen.')
    setBusy(true)
    try {
      await signUp({ locationId, email: email.trim(), consent: true, ...(token ? { turnstileToken: token } : {}) })
      setDone(true)
      remember('claimed')
    } catch (err) {
      setError(signupErrorMessage(err))
      if (siteKey) {
        setToken(null)
        setReset((n) => n + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  const motion = reducedMotion() ? ' offer-card--still' : ''

  return (
    <aside
      className={`offer-card${expanded ? ' offer-card--open' : ''}${done ? ' offer-card--done' : ''}${motion}`}
      role="region"
      aria-labelledby={titleId}
    >
      {!expanded ? (
        <div className="offer-peek">
          <button type="button" className="offer-peek-open" onClick={() => setExpanded(true)} aria-expanded="false">
            <span className="offer-peek-percent">{offer.percent} %</span>
            <span className="offer-peek-text" id={titleId}>{offer.headline}</span>
          </button>
          <button type="button" className="offer-close offer-close--peek" onClick={close} aria-label="Stäng erbjudandet">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="offer-ticket">
          <div className="offer-stub" aria-hidden="true">
            <span className="offer-stub-percent">{offer.percent}<small>%</small></span>
            <span className="offer-stub-label">rabatt</span>
          </div>
          <div className="offer-body">
            <button type="button" className="offer-close" onClick={close} aria-label="Stäng erbjudandet">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            {offer.imageUrl && (
              <img className="offer-dish" src={offer.imageUrl} alt={offer.dishName ?? ''} width={72} height={72} />
            )}
            {done ? (
              <div className="offer-done" role="status">
                <svg className="offer-check" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  <path d="M12 21l6 6 11-13" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h2 id={titleId}>Koden är på väg!</h2>
                <p>
                  Titta i din inkorg (och skräpposten). Bekräfta prenumerationen i mejlet och ange koden när du
                  beställer med samma e-postadress.
                </p>
                <button type="button" className="offer-link-btn" onClick={close}>Stäng</button>
              </div>
            ) : (
              <form className="offer-form" onSubmit={submit} noValidate onFocus={() => setTouched(true)}>
                <h2 id={titleId}>{offer.headline}</h2>
                <p className="offer-text">{offer.text}</p>
                <label className="offer-field">
                  <span className="sr-only">E-post</span>
                  <input type="email" autoComplete="email" inputMode="email" placeholder="din@epost.se"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="offer-consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    Ja, skicka mig erbjudanden och nyheter från {config.tenant.name} via e-post. Jag kan avsluta
                    när jag vill. <Link to="/integritetspolicy">Integritetspolicy</Link>
                  </span>
                </label>
                {siteKey && email.length > 2 && (
                  <TurnstileWidget siteKey={siteKey} resetKey={reset} action="signup" appearance="interaction-only"
                    onToken={setToken} />
                )}
                {error && <p className="offer-error" role="alert">{error}</p>}
                <button type="submit" className="offer-submit" disabled={busy}>
                  {busy ? 'Skickar…' : offer.buttonLabel}
                </button>
                <p className="offer-terms">{terms}.</p>
              </form>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
