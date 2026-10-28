import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isApiConfigured } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { PhoneInput } from '../../shared/PhoneInput'
import { normalizePhone, validEmail } from '../boka/bookingApi'
import { TurnstileWidget } from '../boka/TurnstileWidget'
import { CATEGORY_LABEL, getPublicMenu, groupByCategory } from '../meny/menuApi'
import { useStickyCart } from '../../shared/useStickyCart'
import type { PublicMenuItem } from '../meny/menuApi'
import {
  ALLERGEN_LABEL,
  DIETARY_LABEL,
  createRequest,
  errorMessage,
  firstDate,
  getCateringMenu,
  getQuote,
  getSettings,
  getTiers,
  kronor,
  nextTier,
  rememberToken,
} from './cateringApi'
import type { CateringMenu, CateringSettings, EquipmentReturn, Quote, QuoteInput, Tier } from './cateringApi'
import { FlowSteps } from '../../shared/FlowSteps'
import { GuestDataNotice } from '../../shared/GuestDataNotice'
import { MarketingConsent, NO_CONSENT, consentFields } from '../../shared/MarketingConsent'
import type { ConsentChoice } from '../../shared/MarketingConsent'
import { DateInput, TimeInput } from '../../shared/DateInput'

const STEPS = [{ label: 'Meny' }, { label: 'När & var' }, { label: 'Uppgifter' }, { label: 'Skicka' }]
/** Väntetid efter senaste ändringen innan priset hämtas på nytt. */
export const QUOTE_DEBOUNCE_MS = 350

interface Form {
  customerType: 'private' | 'company'
  name: string
  email: string
  phone: string
  companyName: string
  orgNumber: string
  invoiceReference: string
  signatoryName: string
  signatoryRole: string
  signatoryAuthority: boolean
  deliveryDate: string
  deliveryTime: string
  fulfilment: 'pickup' | 'delivery'
  /** Inget förvalt: gästen väljer själv (avgiften ska vara ett aktivt val). */
  equipmentReturn: EquipmentReturn | ''
  street: string
  postalCode: string
  city: string
  guests: string
  notes: string
  accept: boolean
  consent: ConsentChoice
}

const EMPTY: Form = {
  customerType: 'private', name: '', email: '', phone: '', companyName: '', orgNumber: '', invoiceReference: '',
  signatoryName: '', signatoryRole: '', signatoryAuthority: false,
  deliveryDate: '', deliveryTime: '12:00', fulfilment: 'delivery', equipmentReturn: '', street: '', postalCode: '',
  city: '', guests: '', notes: '', accept: false, consent: NO_CONSENT,
}

const addressComplete = (f: Form) => Boolean(f.street.trim() && /^\d{3} ?\d{2}$/.test(f.postalCode.trim()) && f.city.trim())

function check(form: Form, guests: number, minGuests: number, chosen: number): string | null {
  if (!guests) return 'Fyll i antal gäster.'
  if (guests < minGuests) return `Minst ${minGuests} gäster.`
  if (chosen === 0) return 'Välj minst ett paket eller en rätt.'
  if (!form.deliveryDate) return 'Välj datum.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.deliveryTime)) return 'Välj en tid.'
  if (form.fulfilment === 'delivery' && !addressComplete(form)) return 'Fyll i leveransadressen (gata, postnummer och ort).'
  if (!form.equipmentReturn) return 'Välj hur fat och utrustning lämnas tillbaka.'
  if (!form.name.trim()) return 'Fyll i ditt namn.'
  if (!validEmail(form.email)) return 'Fyll i en giltig e-postadress - offerten skickas dit.'
  if (!normalizePhone(form.phone)) return 'Fyll i ett giltigt mobilnummer, t.ex. 070-123 45 67.'
  if (form.customerType === 'company') {
    if (!form.companyName.trim()) return 'Fyll i företagets namn.'
    if (!/^\d{6}-?\d{4}$/.test(form.orgNumber.trim())) return 'Fyll i organisationsnummer (NNNNNN-NNNN).'
    if (!form.signatoryName.trim() || !form.signatoryRole.trim()) return 'Fyll i vem som signerar för företaget och hens roll.'
    if (!form.signatoryAuthority) return 'Bekräfta att den som signerar får teckna avtal för företaget.'
  }
  if (!form.accept) return 'Godkänn villkoren för att skicka förfrågan.'
  return null
}

function Tags({ allergens, dietary }: { allergens?: string[]; dietary?: string[] }) {
  if (!allergens?.length && !dietary?.length) return null
  return (
    <p className="dish-tags">
      {dietary?.map((d) => <span key={d} className="dish-tag">{DIETARY_LABEL[d] ?? d}</span>)}
      {allergens?.length ? <span className="dish-allergens">Innehåller {allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(', ')}</span> : null}
    </p>
  )
}

/**
 * Cateringkalkylen: gästen anger antal gäster, väljer paket (pris per gäst)
 * och rätter (pris per portion), datum, avhämtning eller leverans och sina
 * uppgifter, och skickar en förfrågan. Priset räknas alltid av servern
 * (getQuote) och visas som ett uppskattat pris; restaurangen svarar med en
 * offert som båda signerar (CateringRequestPage).
 *
 * Innan restaurangen har lagt upp en cateringmeny visas den vanliga menyn
 * (rätter per portion), som tidigare.
 */
export default function CateringPage() {
  const cartRef = useStickyCart<HTMLElement>()
  const { config, location } = useSite()
  const navigate = useNavigate()
  const locationId = location.locationId
  const [settings, setSettings] = useState<CateringSettings | null>(null)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [cateringMenu, setCateringMenu] = useState<CateringMenu>({ dishes: [], packages: [] })
  const [legacyMenu, setLegacyMenu] = useState<PublicMenuItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [form, setForm] = useState<Form>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoting, setQuoting] = useState(false)
  const turnstileSiteKey = config.turnstile?.siteKey ?? null
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileReset, setTurnstileReset] = useState(0)

  useEffect(() => {
    if (!isApiConfigured()) return
    let cancelled = false
    Promise.all([getSettings(locationId), getTiers(locationId),
      getCateringMenu(locationId).catch(() => ({ dishes: [], packages: [] }))])
      .then(async ([s, t, m]) => {
        const legacy = m.dishes.length || m.packages.length ? [] : (await getPublicMenu(locationId)).filter((d) => !d.alcohol)
        if (cancelled) return
        setSettings(s)
        setTiers(t)
        setCateringMenu(m)
        setLegacyMenu(legacy)
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
  const minGuests = settings?.minGuests ?? 1
  const guests = Number(form.guests) || 0
  const dishById = useMemo(() => new Map(cateringMenu.dishes.map((d) => [d.dishId, d])), [cateringMenu])
  const legacyIds = useMemo(() => new Set(legacyMenu.map((d) => d.menuItemId)), [legacyMenu])
  const packages = cateringMenu.packages.map((p) => ({ id: `p:${p.packageId}`, p })).filter(({ id }) => quantities[id] > 0)
  const dishes = cateringMenu.dishes.map((d) => ({ id: `d:${d.dishId}`, d })).filter(({ id }) => quantities[id] > 0)
  const legacy = [...legacyIds].filter((id) => quantities[`m:${id}`] > 0)
  const chosenCount = packages.length + dishes.length + legacy.length

  const selection: Omit<QuoteInput, 'fulfilment'> | null = guests >= minGuests && chosenCount > 0 ? {
    guests,
    ...(packages.length ? { packages: packages.map(({ id, p }) => ({ packageId: p.packageId, quantity: quantities[id] })) } : {}),
    ...(dishes.length ? { dishes: dishes.map(({ id, d }) => ({ dishId: d.dishId, quantity: quantities[id] })) } : {}),
    ...(legacy.length ? { items: legacy.map((id) => ({ menuItemId: id, quantity: quantities[`m:${id}`] })) } : {}),
  } : null
  const address = form.fulfilment === 'delivery' && addressComplete(form)
    ? { street: form.street.trim(), postalCode: form.postalCode.trim(), city: form.city.trim() } : undefined
  const quoteInput: QuoteInput | null = selection ? {
    ...selection, fulfilment: form.fulfilment,
    ...(address ? { deliveryAddress: address } : {}),
    ...(form.equipmentReturn ? { equipmentReturn: form.equipmentReturn } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(form.deliveryDate) ? { deliveryDate: form.deliveryDate } : {}),
  } : null
  const quoteKey = quoteInput ? JSON.stringify(quoteInput) : ''

  useEffect(() => {
    if (!quoteKey) {
      setQuote(null)
      setQuoteError(null)
      return
    }
    let cancelled = false
    setQuoting(true)
    const timer = window.setTimeout(() => {
      getQuote(locationId, JSON.parse(quoteKey) as QuoteInput)
        .then((q) => {
          if (cancelled) return
          setQuote(q)
          setQuoteError(null)
          setForm((f) => (f.deliveryDate && f.deliveryDate < q.earliestDate ? { ...f, deliveryDate: q.earliestDate } : f))
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setQuote(null)
          setQuoteError(errorMessage(err))
        })
        .finally(() => !cancelled && setQuoting(false))
    }, QUOTE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [locationId, quoteKey])

  const upcoming = nextTier(tiers, guests)
  const stepAt = chosenCount === 0 || guests < minGuests ? 1 : !form.deliveryDate || !form.equipmentReturn ? 2
    : !(form.name.trim() && form.email.trim() && form.phone) ? 3 : 4

  function setQty(id: string, value: number) {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(5000, Math.round(value) || 0)) }))
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    const problem = check(form, guests, minGuests, chosenCount)
    if (problem || !form.equipmentReturn || !quoteInput) return setError(problem)
    if (turnstileSiteKey && !turnstileToken) return setError('Bekräfta säkerhetskontrollen ovanför knappen.')
    setBusy(true)
    try {
      const created = await createRequest(locationId, {
        ...quoteInput,
        customerType: form.customerType,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        ...(form.customerType === 'company'
          ? { companyName: form.companyName.trim(), orgNumber: form.orgNumber.trim(),
              signatoryName: form.signatoryName.trim(), signatoryRole: form.signatoryRole.trim(),
              signatoryAuthority: true as const,
              ...(form.invoiceReference.trim() ? { invoiceReference: form.invoiceReference.trim() } : {}) }
          : {}),
        deliveryDate: form.deliveryDate,
        deliveryTime: form.deliveryTime,
        equipmentReturn: form.equipmentReturn,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        acceptTerms: true,
        language: 'sv',
        ...(turnstileToken ? { turnstileToken } : {}),
        ...consentFields(form.consent, config.privacy, Boolean(config.tenant.features.marketing)),
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

  const qtyInput = (id: string, label: string) => (
    <input
      type="number"
      min={0}
      max={5000}
      inputMode="numeric"
      aria-label={label}
      value={quantities[id] || ''}
      placeholder="0"
      onChange={(e) => setQty(id, Number(e.target.value))}
    />
  )

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">Catering</p>
        <h1>Räkna på catering</h1>
        <p className="hero-sub">
          Ange antal gäster, välj meny och se ett uppskattat pris direkt. Du får en offert som du godkänner med BankID.
        </p>
        <FlowSteps steps={STEPS} current={stepAt} label="Catering" />
      </section>

      <form className="order-layout" onSubmit={submit} noValidate>
        <div className="order-menu">
          <h2 className="catering-step-title">1. Antal gäster och meny</h2>
          <div className="booking-grid catering-guests">
            <label className="booking-field">
              Antal gäster
              <input inputMode="numeric" value={form.guests} aria-describedby="catering-guest-hint"
                onChange={(e) => set('guests', e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
          </div>
          <p className="order-hint" id="catering-guest-hint">
            Minst {minGuests} gäster
            {tiers.length > 0 && ` · rabatt från ${Math.min(...tiers.map((t) => t.fromPortions))} gäster`}
            {' · '}förberedelsetiden beror på antalet gäster
          </p>

          {cateringMenu.packages.length > 0 && (
            <section aria-label="Paket">
              <h2 className="menu-content-title">Paket</h2>
              <p className="order-hint">Pris per gäst. Fyll i hur många gäster som ska ha paketet.</p>
              <ul className="catering-dishes">
                {cateringMenu.packages.map((p) => {
                  const id = `p:${p.packageId}`
                  const inside = p.dishIds.map((d) => dishById.get(d)).filter((d) => d !== undefined)
                  return (
                    <li key={p.packageId}>
                      <div>
                        <strong>{p.name}</strong>
                        {p.description && <p className="dish-desc">{p.description}</p>}
                        {inside.length > 0 && <p className="dish-desc">{inside.map((d) => d.name).join(' · ')}</p>}
                        <Tags allergens={[...new Set(inside.flatMap((d) => d.allergens ?? []))]} />
                        {p.minGuests ? <p className="dish-desc">Från {p.minGuests} gäster</p> : null}
                      </div>
                      <span className="dish-price">{kronor(Math.round(p.pricePerGuest * 100))}/gäst</span>
                      <span className="catering-qty">
                        {qtyInput(id, `Gäster ${p.name}`)}
                        {guests > 0 && quantities[id] !== guests && (
                          <button type="button" className="link-button" onClick={() => setQty(id, guests)}>
                            Alla {guests}
                          </button>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {cateringMenu.dishes.length > 0 && (
            <section aria-label="Rätter">
              <h2 className="menu-content-title">{cateringMenu.packages.length ? 'Lägg till rätter' : 'Rätter'}</h2>
              <ul className="catering-dishes">
                {cateringMenu.dishes.map((d) => (
                  <li key={d.dishId}>
                    <div>
                      <strong>{d.name}</strong>
                      {d.description && <p className="dish-desc">{d.description}</p>}
                      <Tags allergens={d.allergens} dietary={d.dietary} />
                    </div>
                    <span className="dish-price">{kronor(Math.round(d.pricePerPortion * 100))}/port</span>
                    {qtyInput(`d:${d.dishId}`, `Portioner ${d.name}`)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groupByCategory(legacyMenu).map((group) => (
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
                    {qtyInput(`m:${dish.menuItemId}`, `Portioner ${dish.name}`)}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {chosenCount === 0 || guests < minGuests ? (
            <p className="notice catering-next" role="status">
              Fyll i antal gäster och välj paket eller rätter ovan - sedan väljer du datum, leverans och dina uppgifter.
            </p>
          ) : (
          <>
          <section className="catering-details" aria-label="När och var">
            <h2 className="catering-step-title">2. När och var</h2>
            {settings.pickup && settings.delivery && (
              <div className="segmented" role="radiogroup" aria-label="Avhämtning eller leverans">
                {(['delivery', 'pickup'] as const).map((v) => (
                  <label key={v} className={form.fulfilment === v ? 'on' : ''}>
                    <input type="radio" name="fulfilment" checked={form.fulfilment === v}
                      onChange={() => set('fulfilment', v)} />
                    {v === 'delivery' ? 'Leverans' : 'Avhämtning'}
                  </label>
                ))}
              </div>
            )}
            <div className="booking-grid">
              <label className="booking-field">
                Datum
                <DateInput min={quote?.earliestDate ?? firstDate(settings.advanceDays)} value={form.deliveryDate}
                  onChange={(e) => set('deliveryDate', e.target.value)} />
              </label>
              <label className="booking-field">
                Tid
                <TimeInput value={form.deliveryTime} onChange={(e) => set('deliveryTime', e.target.value)} />
              </label>
            </div>
            {quote && (
              <p className="order-hint">Tidigast {new Date(`${quote.earliestDate}T12:00:00Z`).toLocaleDateString('sv-SE',
                { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })} för {guests} gäster.</p>
            )}
            {form.fulfilment === 'delivery' && (
              <>
                <div className="booking-grid">
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
                <p className="order-hint">Leveranspriset räknas på vägavståndet från restaurangen.</p>
              </>
            )}
            <fieldset className="equipment-return">
              <legend>Hur lämnas fat och utrustning tillbaka?</legend>
              {(['cleaned', 'not_cleaned'] as const).map((v) => (
                <label key={v} className={`booking-check${form.equipmentReturn === v ? ' on' : ''}`}>
                  <input type="radio" name="equipmentReturn" value={v} checked={form.equipmentReturn === v}
                    onChange={() => set('equipmentReturn', v)} />
                  <span>
                    {v === 'cleaned'
                      ? 'Rengjord utrustning (ingen extra kostnad)'
                      : 'Ej rengjord utrustning (rengöringsavgift tillkommer)'}
                    {v === 'not_cleaned' && (settings.cleaningFee ?? 0) > 0 && (
                      <span className="equipment-return-fee">{kronor((settings.cleaningFee ?? 0) * 100)}</span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          <section className="catering-details" aria-label="Dina uppgifter">
            <h2 className="catering-step-title">3. Dina uppgifter</h2>
            <div className="segmented" role="radiogroup" aria-label="Beställare">
              <label className={form.customerType === 'private' ? 'on' : ''}>
                <input type="radio" name="customerType" checked={form.customerType === 'private'}
                  onChange={() => set('customerType', 'private')} />
                Privatperson
              </label>
              <label className={form.customerType === 'company' ? 'on' : ''}>
                <input type="radio" name="customerType" checked={form.customerType === 'company'}
                  onChange={() => set('customerType', 'company')} />
                Företag
              </label>
            </div>
            <p className="cell-muted">
              {form.customerType === 'private'
                ? 'Du betalar med kort eller Swish efter att du godkänt offerten.'
                : `Ni får en faktura med ${settings.paymentTermsDays} dagars betalningsvillkor.`}
            </p>
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
                  <label className="booking-field">
                    Den som signerar
                    <input autoComplete="name" value={form.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
                  </label>
                  <label className="booking-field">
                    Roll (t.ex. VD, inköpare)
                    <input autoComplete="organization-title" value={form.signatoryRole}
                      onChange={(e) => set('signatoryRole', e.target.value)} />
                  </label>
                  <label className="booking-check booking-field--wide">
                    <input type="checkbox" checked={form.signatoryAuthority}
                      onChange={(e) => set('signatoryAuthority', e.target.checked)} />
                    <span>Jag intygar att den som signerar har rätt att teckna avtal för företaget.</span>
                  </label>
                </>
              )}
              <label className="booking-field">
                {form.customerType === 'company' ? 'Kontaktperson' : 'Namn'}
                <input autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </label>
              <label className="booking-field">
                E-post
                <input type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </label>
              <label className="booking-field">
                Mobilnummer
                <PhoneInput value={form.phone} onChange={(v) => set('phone', v)} />
              </label>
              <label className="booking-field booking-field--wide">
                Önskemål, allergier, servering (valfritt)
                <textarea rows={3} maxLength={1000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </label>
            </div>
          </section>
          </>
          )}
        </div>

        <aside className="order-cart" ref={cartRef} aria-label="Kalkyl" aria-busy={quoting}>
          <h2>Kalkyl{guests > 0 && ` · ${guests} gäster`}</h2>
          {!quote ? (
            <p className="cart-empty" role="status">
              {quoteError ?? (selection ? 'Räknar…' : `Fyll i antal gäster (minst ${minGuests}) och välj paket eller rätter.`)}
            </p>
          ) : (
            <>
              <ul className={`cart-list${quoting ? ' is-stale' : ''}`}>
                {quote.lines.map((l) => (
                  <li key={`${l.kind}:${l.packageId ?? l.dishId ?? l.menuItemId}`}>
                    <span className="cart-item-name">{l.quantity} × {l.name}</span>
                    <span />
                    <span className="cart-item-price">{kronor(l.unitPrice * l.quantity)}</span>
                  </li>
                ))}
              </ul>
              {quote.discount > 0 && (
                <div className="cart-total catering-discount">
                  <span>Rabatt {quote.tierName} (-{quote.discountPercent} %)</span>
                  <span>-{kronor(quote.discount)}</span>
                </div>
              )}
              {form.fulfilment === 'delivery' && (
                <div className="cart-total">
                  <span>Leverans{quote.distanceKm != null && ` (${String(quote.distanceKm).replace('.', ',')} km)`}</span>
                  <span>{quote.deliveryFeeManual ? (address ? 'Sätts i offerten' : 'Ange adress') : kronor(quote.deliveryFee)}</span>
                </div>
              )}
              {(quote.cleaningFee ?? 0) > 0 && (
                <div className="cart-total"><span>Rengöringsavgift</span><span>{kronor(quote.cleaningFee)}</span></div>
              )}
              <div className="cart-total"><span>Uppskattat pris inkl. moms</span><span>{kronor(quote.total)}</span></div>
              <p className="cart-note">Varav moms {quote.vatRate} %: {kronor(quote.vat)}</p>
              {quoteError && <p className="notice error" role="alert">{quoteError}</p>}
            </>
          )}
          {upcoming && guests >= minGuests && (
            <p className="cart-note">
              {upcoming.fromPortions - guests} gäster till ger {upcoming.discountPercent} % rabatt.
            </p>
          )}
          <p className="cart-note catering-estimate">Uppskattat pris, bindande först när offerten signerats.</p>
          <label className="booking-check">
            <input type="checkbox" checked={form.accept} onChange={(e) => set('accept', e.target.checked)} />
            <span>Jag godkänner att restaurangen kontaktar mig om förfrågan.</span>
          </label>
          <MarketingConsent value={form.consent} onChange={(v) => set('consent', v)} />
          <GuestDataNotice kind="catering" />
          {turnstileSiteKey && (
            <TurnstileWidget siteKey={turnstileSiteKey} resetKey={turnstileReset} action="catering"
              onToken={setTurnstileToken} />
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
          <button type="submit" className={`btn-primary${busy ? ' is-busy' : ''}`} disabled={busy || chosenCount === 0}>
            {busy ? <><span className="spinner" aria-hidden="true" />Skickar förfrågan…</> : 'Skicka förfrågan'}
          </button>
        </aside>
      </form>
    </>
  )
}
