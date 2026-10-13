import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isApiConfigured } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { normalizePhone, validEmail } from '../boka/bookingApi'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import { CATEGORY_LABEL, getPublicMenu, groupByCategory } from '../meny/menuApi'
import type { PublicMenuItem } from '../meny/menuApi'
import {
  createRequest,
  errorMessage,
  estimate,
  firstDate,
  getSettings,
  getTiers,
  kronor,
  nextTier,
  rememberToken,
} from './cateringApi'
import type { CateringSettings, Tier } from './cateringApi'

interface Form {
  customerType: 'private' | 'company'
  name: string
  email: string
  phone: string
  companyName: string
  orgNumber: string
  invoiceReference: string
  deliveryDate: string
  deliveryTime: string
  fulfilment: 'pickup' | 'delivery'
  deliveryZone: 'within' | 'beyond'
  street: string
  postalCode: string
  city: string
  guests: string
  notes: string
  accept: boolean
}

const EMPTY: Form = {
  customerType: 'private', name: '', email: '', phone: '', companyName: '', orgNumber: '', invoiceReference: '',
  deliveryDate: '', deliveryTime: '12:00', fulfilment: 'delivery', deliveryZone: 'within', street: '', postalCode: '',
  city: '', guests: '', notes: '', accept: false,
}

function check(form: Form, portions: number, settings: CateringSettings): string | null {
  if (portions < settings.minPortions) return `Välj minst ${settings.minPortions} portioner totalt.`
  if (portions > settings.maxPortions) return `Högst ${settings.maxPortions} portioner totalt - kontakta restaurangen för större beställningar.`
  if (!form.deliveryDate) return 'Välj datum.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.deliveryTime)) return 'Välj en tid.'
  if (form.fulfilment === 'delivery' && (!form.street.trim() || !/^\d{3} ?\d{2}$/.test(form.postalCode.trim()) || !form.city.trim())) {
    return 'Fyll i leveransadressen (gata, postnummer och ort).'
  }
  if (!form.name.trim()) return 'Fyll i ditt namn.'
  if (!validEmail(form.email)) return 'Fyll i en giltig e-postadress - offerten skickas dit.'
  if (!normalizePhone(form.phone)) return 'Fyll i ett giltigt mobilnummer, t.ex. 070-123 45 67.'
  if (form.customerType === 'company') {
    if (!form.companyName.trim()) return 'Fyll i företagets namn.'
    if (!/^\d{6}-?\d{4}$/.test(form.orgNumber.trim())) return 'Fyll i organisationsnummer (NNNNNN-NNNN).'
  }
  if (!form.accept) return 'Godkänn villkoren för att skicka förfrågan.'
  return null
}

/**
 * Cateringkalkylen: gästen väljer portioner per rätt och ser priset med
 * rabattnivå och leverans direkt, fyller i datum och kontaktuppgifter och
 * skickar en förfrågan. Restaurangen svarar med en offert som gästen
 * signerar med BankID (CateringRequestPage). Priset räknas om av servern.
 */
export default function CateringPage() {
  const { config, location } = useSite()
  const navigate = useNavigate()
  const locationId = location.locationId
  const [settings, setSettings] = useState<CateringSettings | null>(null)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [menu, setMenu] = useState<PublicMenuItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [form, setForm] = useState<Form>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const turnstileSiteKey = config.turnstile?.siteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)

  useEffect(() => {
    if (!isApiConfigured()) return
    let cancelled = false
    Promise.all([getSettings(locationId), getTiers(locationId), getPublicMenu(locationId)])
      .then(([s, t, m]) => {
        if (cancelled) return
        setSettings(s)
        setTiers(t)
        setMenu(m.filter((d) => !d.alcohol))
        setForm((f) => ({ ...f, deliveryDate: f.deliveryDate || firstDate(s.advanceDays),
          fulfilment: s.delivery ? 'delivery' : 'pickup' }))
      })
      .catch((err: unknown) => !cancelled && setLoadError(errorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [locationId])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }
  const byId = useMemo(() => new Map(menu.map((d) => [d.menuItemId, d])), [menu])
  const chosen = Object.entries(quantities).filter(([id, q]) => q > 0 && byId.has(id))
  const deliveryFeeKr = !settings || form.fulfilment === 'pickup' ? 0
    : form.deliveryZone === 'beyond' ? settings.priceBeyondLimit : settings.priceWithinLimit
  const calc = estimate(chosen.map(([id, q]) => ({ price: byId.get(id)!.price, quantity: q })), tiers, deliveryFeeKr)
  const upcoming = nextTier(tiers, calc.portions)

  function setQty(id: string, value: number) {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(5000, Math.round(value) || 0)) }))
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    const problem = check(form, calc.portions, settings)
    if (problem) return setError(problem)
    if (turnstileSiteKey && !turnstileToken) return setError('Bekräfta säkerhetskontrollen ovanför knappen.')
    setBusy(true)
    try {
      const created = await createRequest(locationId, {
        items: chosen.map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
        customerType: form.customerType,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        ...(form.customerType === 'company'
          ? { companyName: form.companyName.trim(), orgNumber: form.orgNumber.trim(),
              ...(form.invoiceReference.trim() ? { invoiceReference: form.invoiceReference.trim() } : {}) }
          : {}),
        deliveryDate: form.deliveryDate,
        deliveryTime: form.deliveryTime,
        fulfilment: form.fulfilment,
        ...(form.fulfilment === 'delivery'
          ? { deliveryZone: form.deliveryZone,
              deliveryAddress: { street: form.street.trim(), postalCode: form.postalCode.trim(), city: form.city.trim() } }
          : {}),
        ...(form.guests.trim() ? { guests: Number(form.guests) } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        acceptTerms: true,
        language: 'sv',
        ...(turnstileToken ? { turnstileToken } : {}),
      })
      rememberToken(created.requestId, created.token)
      navigate(`/catering/${created.locationId}/${created.requestId}?skickad=1`)
    } catch (err) {
      setError(errorMessage(err))
      if (turnstileSiteKey) {
        setTurnstileToken(null)
        setTurnstileReset((n) => n + 1)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="notice error" role="alert">{loadError}</p>
  if (!settings) return <p className="notice" role="status">Hämtar cateringmenyn…</p>
  if (!settings.enabled) {
    return <p className="notice" role="status">{config.tenant.name} tar inte emot cateringförfrågningar just nu.</p>
  }

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">Catering</p>
        <h1>Räkna på catering</h1>
        <p className="hero-sub">
          Välj rätter och antal portioner - priset räknas direkt. Skicka förfrågan så får du en offert som du
          godkänner med BankID.
        </p>
      </section>

      <form className="order-layout" onSubmit={submit} noValidate>
        <div className="order-menu">
          <p className="order-hint">
            Minst {settings.minPortions} portioner · beställ minst {settings.advanceDays} dagar i förväg
            {tiers.length > 0 && ` · rabatt från ${Math.min(...tiers.map((t) => t.fromPortions))} portioner`}
          </p>
          {groupByCategory(menu).map((group) => (
            <section key={group.category} aria-label={CATEGORY_LABEL[group.category]}>
              <h2 className="menu-content-title">{CATEGORY_LABEL[group.category]}</h2>
              <ul className="catering-dishes">
                {group.items.map((dish) => (
                  <li key={dish.menuItemId}>
                    <div>
                      <strong>{dish.name}</strong>
                      {dish.description && <p className="dish-desc">{dish.description}</p>}
                    </div>
                    <span className="dish-price">{kronor(Math.round(dish.price * 100))}/port</span>
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      inputMode="numeric"
                      aria-label={`Portioner ${dish.name}`}
                      value={quantities[dish.menuItemId] || ''}
                      placeholder="0"
                      onChange={(e) => setQty(dish.menuItemId, Number(e.target.value))}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="catering-details" aria-label="Leverans och kontakt">
            <h2 className="menu-content-title">Leverans och kontakt</h2>
            <div className="booking-grid">
              <label className="booking-field">
                Datum
                <input type="date" min={firstDate(settings.advanceDays)} value={form.deliveryDate}
                  onChange={(e) => set('deliveryDate', e.target.value)} />
              </label>
              <label className="booking-field">
                Tid
                <input type="time" step={900} value={form.deliveryTime} onChange={(e) => set('deliveryTime', e.target.value)} />
              </label>
              <label className="booking-field">
                Antal gäster (valfritt)
                <input inputMode="numeric" value={form.guests} onChange={(e) => set('guests', e.target.value.replace(/\D/g, ''))} />
              </label>
              {settings.pickup && settings.delivery && (
                <label className="booking-field">
                  Avhämtning eller leverans
                  <select value={form.fulfilment} onChange={(e) => set('fulfilment', e.target.value as Form['fulfilment'])}>
                    <option value="delivery">Leverans</option>
                    <option value="pickup">Avhämtning</option>
                  </select>
                </label>
              )}
            </div>
            {form.fulfilment === 'delivery' && (
              <div className="booking-grid">
                <label className="booking-field">
                  Leveransområde
                  <select value={form.deliveryZone} onChange={(e) => set('deliveryZone', e.target.value as Form['deliveryZone'])}>
                    <option value="within">
                      Inom {settings.deliveryArea || `${settings.maxDistanceKm} km`} ({settings.priceWithinLimit} kr)
                    </option>
                    {settings.allowOutsideArea && (
                      <option value="beyond">Längre än {settings.maxDistanceKm} km ({settings.priceBeyondLimit} kr)</option>
                    )}
                  </select>
                </label>
                <label className="booking-field">
                  Gatuadress
                  <input autoComplete="street-address" value={form.street} onChange={(e) => set('street', e.target.value)} />
                </label>
                <label className="booking-field">
                  Postnummer
                  <input autoComplete="postal-code" inputMode="numeric" value={form.postalCode}
                    onChange={(e) => set('postalCode', e.target.value)} />
                </label>
                <label className="booking-field">
                  Ort
                  <input autoComplete="address-level2" value={form.city} onChange={(e) => set('city', e.target.value)} />
                </label>
              </div>
            )}
            <div className="catering-type" role="radiogroup" aria-label="Beställare">
              <label className="booking-check">
                <input type="radio" name="customerType" checked={form.customerType === 'private'}
                  onChange={() => set('customerType', 'private')} />
                <span>Privatperson - betala med kort eller Swish när du signerat</span>
              </label>
              <label className="booking-check">
                <input type="radio" name="customerType" checked={form.customerType === 'company'}
                  onChange={() => set('customerType', 'company')} />
                <span>Företag - faktura ({settings.paymentTermsDays} dagar)</span>
              </label>
            </div>
            <div className="booking-grid">
              {form.customerType === 'company' && (
                <>
                  <label className="booking-field">
                    Företag
                    <input autoComplete="organization" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
                  </label>
                  <label className="booking-field">
                    Organisationsnummer
                    <input placeholder="556677-8899" value={form.orgNumber} onChange={(e) => set('orgNumber', e.target.value)} />
                  </label>
                  <label className="booking-field">
                    Fakturareferens (valfritt)
                    <input value={form.invoiceReference} onChange={(e) => set('invoiceReference', e.target.value)} />
                  </label>
                </>
              )}
              <label className="booking-field">
                Namn
                <input autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </label>
              <label className="booking-field">
                E-post
                <input type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </label>
              <label className="booking-field">
                Mobilnummer
                <input type="tel" autoComplete="tel" placeholder="070-123 45 67" value={form.phone}
                  onChange={(e) => set('phone', e.target.value)} />
              </label>
              <label className="booking-field booking-field--wide">
                Önskemål, allergier, servering (valfritt)
                <textarea rows={3} maxLength={1000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </label>
            </div>
          </section>
        </div>

        <aside className="order-cart" aria-label="Kalkyl">
          <h2>Kalkyl · {calc.portions} portioner</h2>
          {chosen.length === 0 ? (
            <p className="cart-empty">Ange antal portioner för en eller flera rätter.</p>
          ) : (
            <ul className="cart-list">
              {chosen.map(([id, q]) => (
                <li key={id}>
                  <span className="cart-item-name">{q} × {byId.get(id)!.name}</span>
                  <span />
                  <span className="cart-item-price">{kronor(Math.round(byId.get(id)!.price * 100) * q)}</span>
                </li>
              ))}
            </ul>
          )}
          {calc.discount > 0 && (
            <div className="cart-total catering-discount">
              <span>Rabatt {calc.tier?.name} (-{calc.discountPercent} %)</span>
              <span>-{kronor(calc.discount)}</span>
            </div>
          )}
          {calc.deliveryFee > 0 && (
            <div className="cart-total"><span>Leverans</span><span>{kronor(calc.deliveryFee)}</span></div>
          )}
          <div className="cart-total"><span>Totalt inkl. moms</span><span>{kronor(calc.total)}</span></div>
          {upcoming && calc.portions > 0 && (
            <p className="cart-note">
              {upcoming.fromPortions - calc.portions} portioner till ger {upcoming.discountPercent} % rabatt.
            </p>
          )}
          <p className="cart-note">Preliminärt pris - restaurangen bekräftar med en offert.</p>
          <label className="booking-check">
            <input type="checkbox" checked={form.accept} onChange={(e) => set('accept', e.target.checked)} />
            <span>
              Jag godkänner att restaurangen kontaktar mig om förfrågan och har läst{' '}
              <Link to="/integritetspolicy">integritetspolicyn</Link>.
            </span>
          </label>
          {turnstileSiteKey && (
            <TurnstileWidget siteKey={turnstileSiteKey} resetKey={turnstileReset} action="catering"
              onToken={setTurnstileToken} />
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy || calc.portions === 0}>
            {busy ? 'Skickar…' : 'Skicka förfrågan'}
          </button>
        </aside>
      </form>
    </>
  )
}
