import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CateringPage from './CateringPage'
import CateringRequestPage, { SIGN_POLL_MS } from './CateringRequestPage'
import { firstDate, tokenFor } from './cateringApi'
import type { CateringSettings, GuestRequest, Quote, Tier } from './cateringApi'
import { WithSite } from '../../test/siteFixture'
import { SiteContext } from '../../shared/SiteContext'
import { siteConfig } from '../../test/siteData'

const api = vi.hoisted(() => ({
  getSettings: vi.fn(), getTiers: vi.fn(), createRequest: vi.fn(), getRequest: vi.fn(), getQuote: vi.fn(),
  getCateringMenu: vi.fn(), acceptOffer: vi.fn(), documentLink: vi.fn(),
  startSigning: vi.fn(), signingStatus: vi.fn(), startCheckout: vi.fn(), requestChange: vi.fn(), rejectOffer: vi.fn(),
}))
vi.mock('./cateringApi', async (orig) => {
  const real = await orig<typeof import('./cateringApi')>()
  return Object.fromEntries(Object.entries(real).map(([k, v]) =>
    [k, k in api ? (...a: unknown[]) => (api as Record<string, (...x: unknown[]) => unknown>)[k](...a) : v]))
})
const getPublicMenu = vi.fn()
vi.mock('../meny/menuApi', async (orig) => ({
  ...(await orig<typeof import('../meny/menuApi')>()),
  getPublicMenu: (...a: unknown[]) => getPublicMenu(...a),
}))
vi.mock('../../shared/api', async (orig) => ({
  ...(await orig<typeof import('../../shared/api')>()),
  isApiConfigured: () => true,
}))
vi.mock('qrcode', () => ({ default: { toDataURL: (d: string) => Promise.resolve(`data:qr,${d}`) } }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(async () => ({})) }))
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    queueMicrotask(() => onReady?.())
    return <div>Stripes betalformulär</div>
  },
  useCheckoutElements: () => ({ type: 'success', checkout: { confirm } }),
}))

const SETTINGS: CateringSettings = {
  enabled: true, minPortions: 10, maxPortions: 300, advanceDays: 5, pickup: true, delivery: false,
  deliveryArea: 'Norrköping', maxDistanceKm: 25, priceWithinLimit: 395, priceBeyondLimit: 795,
  allowOutsideArea: false, terms: 'Villkor', offerValidDays: 7, paymentTermsDays: 30, minGuests: 15,
}
const QUOTE: Quote = {
  lines: [{ kind: 'menu', menuItemId: 'm1', name: 'Lasagne', unitPrice: 5000, quantity: 30, vatRate: 12 }],
  guests: 30, portions: 30, tierName: 'Nivå 1', subtotal: 150000, discountPercent: 10, discount: 15000, deliveryFee: 0,
  cleaningFee: 0, total: 135000, vat: 14464, vatRate: 12, serviceIncluded: true, distanceKm: null,
  deliveryFeeManual: false, earliestDate: '2026-11-01',
}
const TIERS: Tier[] = [{ tierId: 't1', name: 'Nivå 1', fromPortions: 30, toPortions: null, discountPercent: 10, active: true }]
const TOTALS = { subtotal: 150000, discountPercent: 10, discount: 15000, deliveryFee: 0, total: 135000, vat: 14464 }

function guest(extra: Partial<GuestRequest> = {}): GuestRequest {
  return {
    requestId: 'req-1', locationId: 'loc-1', status: 'offer_sent', customerType: 'private', customerName: 'Anna Andersson',
    deliveryDate: '2026-11-20', deliveryTime: '12:00', fulfilment: 'pickup',
    request: { lines: [{ name: 'Lasagne', unitPrice: 5000, quantity: 30 }], portions: 30, ...TOTALS },
    offer: { version: 1, lines: [{ name: 'Lasagne', unitPrice: 5000, quantity: 30 }], totals: TOTALS, validUntil: '2026-11-01',
      message: 'Välkommen!', terms: 'Villkor', documentHash: 'f'.repeat(64) },
    canSign: true, canPay: false, ...extra,
  }
}

function renderGuest(hash = '#t=tok-1') {
  const config = siteConfig()
  config.stripe = { publishableKey: 'pk_test_1', accountId: 'acct_1' }
  return render(
    <MemoryRouter initialEntries={[`/catering/loc-1/req-1${hash}`]}>
      <SiteContext.Provider value={{ config, location: config.locations[0], setLocationId: () => {} }}>
        <Routes>
          <Route path="catering/:locationId/:requestId" element={<CateringRequestPage />} />
        </Routes>
      </SiteContext.Provider>
    </MemoryRouter>,
  )
}

const assign = vi.fn()
beforeEach(() => {
  sessionStorage.clear()
  Object.values(api).forEach((f) => f.mockReset())
  getPublicMenu.mockReset()
  assign.mockReset()
  vi.stubGlobal('location', { ...window.location, assign })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('catering helpers', () => {
  it('first date is advanceDays after today in Stockholm', () => {
    expect(firstDate(5, new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-18')
  })

  it('keeps the link token in the tab', () => {
    expect(tokenFor('req-1', '#t=abc')).toBe('abc')
    expect(tokenFor('req-1', '')).toBe('abc')
  })
})

function renderCalculator() {
  const config = siteConfig({ features: { reservations: true, ordering: false, catering: true, terminal: false } })
  return render(
    <WithSite config={config} path="/catering">
      <Routes>
        <Route path="/catering" element={<CateringPage />} />
        <Route path="/catering/:locationId/:requestId" element={<p>Skickad sida</p>} />
      </Routes>
    </WithSite>,
  )
}

describe('CateringPage', () => {
  it('shows the server price for guests and dishes and sends the request', async () => {
    const user = userEvent.setup()
    api.getSettings.mockResolvedValue(SETTINGS)
    api.getTiers.mockResolvedValue(TIERS)
    api.getCateringMenu.mockResolvedValue({ dishes: [], packages: [] })
    api.getQuote.mockResolvedValue(QUOTE)
    getPublicMenu.mockResolvedValue([
      { menuItemId: 'm1', name: 'Lasagne', description: '', price: 50, category: 'mains' },
      { menuItemId: 'w1', name: 'Vin', description: '', price: 95, category: 'drinks', alcohol: true },
    ])
    api.createRequest.mockResolvedValue({ requestId: 'req-9', locationId: 'loc-1', token: 'tok-9' })
    renderCalculator()
    const input = await screen.findByLabelText('Portioner Lasagne')
    expect(screen.queryByLabelText('Portioner Vin')).not.toBeInTheDocument()
    await user.type(input, '30')
    const cart = screen.getByRole('complementary', { name: 'Kalkyl' })
    expect(within(cart).getByText(/Fyll i antal gäster/)).toBeInTheDocument()
    expect(api.getQuote).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Antal gäster'), '30')
    expect(await within(cart).findByText(/Rabatt Nivå 1/)).toBeInTheDocument()
    expect(within(cart).getByText('1 350 kr')).toBeInTheDocument()
    expect(within(cart).getByText('Uppskattat pris, bindande först när offerten signerats.')).toBeInTheDocument()
    expect(api.getQuote).toHaveBeenLastCalledWith('loc-1', expect.objectContaining({
      guests: 30, items: [{ menuItemId: 'm1', quantity: 30 }], fulfilment: 'pickup',
    }))
    await user.click(screen.getByRole('radio', { name: 'Rengjord utrustning (ingen extra kostnad)' }))

    await user.click(within(cart).getByRole('button', { name: 'Skicka förfrågan' }))
    expect(await within(cart).findByRole('alert')).toHaveTextContent('Fyll i ditt namn.')
    await user.type(screen.getByLabelText('Namn'), 'Anna Andersson')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Mobilnummer'), '070-123 45 67')
    await user.click(within(cart).getByRole('checkbox', { name: /kontaktar mig/ }))
    await user.click(within(cart).getByRole('button', { name: 'Skicka förfrågan' }))
    expect(api.createRequest).toHaveBeenCalledWith('loc-1', expect.objectContaining({
      guests: 30, items: [{ menuItemId: 'm1', quantity: 30 }], customerType: 'private', fulfilment: 'pickup',
      name: 'Anna Andersson', acceptTerms: true, equipmentReturn: 'cleaned',
    }))
    expect(await screen.findByText('Skickad sida')).toBeInTheDocument()
    expect(sessionStorage.length).toBeGreaterThan(0)
  })

  it('offers the catering packages per guest and asks a company for its signatory', async () => {
    const user = userEvent.setup()
    api.getSettings.mockResolvedValue({ ...SETTINGS, delivery: true, cleaningFee: 300 })
    api.getTiers.mockResolvedValue([])
    api.getCateringMenu.mockResolvedValue({
      dishes: [{ dishId: 'd1', name: 'Kycklingspett', pricePerPortion: 85, allergens: ['milk'], dietary: ['gluten_free'] }],
      packages: [{ packageId: 'p1', name: 'Buffé Roma', pricePerGuest: 245, dishIds: ['d1'], minGuests: 20 }],
    })
    api.getQuote.mockResolvedValue({ ...QUOTE, lines: [{ kind: 'package', packageId: 'p1', name: 'Buffé Roma',
      unitPrice: 24500, quantity: 40 }], discount: 0, deliveryFee: 59500, distanceKm: 12.4, total: 1039500 })
    api.createRequest.mockResolvedValue({ requestId: 'req-9', locationId: 'loc-1', token: 'tok-9' })
    renderCalculator()
    await user.type(await screen.findByLabelText('Antal gäster'), '40')
    expect(screen.getAllByText('Innehåller mjölk')).toHaveLength(2)
    expect(screen.getByText('Glutenfri')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Alla 40' }))
    const cart = screen.getByRole('complementary', { name: 'Kalkyl' })
    expect(await within(cart).findByText('40 × Buffé Roma')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Gatuadress'), 'Storgatan 1')
    await user.type(screen.getByLabelText('Postnummer'), '111 22')
    await user.type(screen.getByLabelText('Ort'), 'Stockholm')
    expect(await within(cart).findByText('Leverans (12,4 km)')).toBeInTheDocument()
    await waitFor(() => expect(api.getQuote).toHaveBeenLastCalledWith('loc-1', expect.objectContaining({
      guests: 40, packages: [{ packageId: 'p1', quantity: 40 }], fulfilment: 'delivery',
      deliveryAddress: { street: 'Storgatan 1', postalCode: '111 22', city: 'Stockholm' },
    })))
    await user.click(screen.getByRole('radio', { name: 'Rengjord utrustning (ingen extra kostnad)' }))
    await user.click(screen.getByRole('radio', { name: 'Företag' }))
    await user.type(screen.getByRole('textbox', { name: 'Företag' }), 'Acme AB')
    await user.type(screen.getByLabelText('Organisationsnummer'), '556000-1234')
    await user.type(screen.getByLabelText('Kontaktperson'), 'Anna Andersson')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Mobilnummer'), '070-123 45 67')
    await user.click(within(cart).getByRole('checkbox', { name: /kontaktar mig/ }))
    await user.click(within(cart).getByRole('button', { name: 'Skicka förfrågan' }))
    expect(await within(cart).findByRole('alert')).toHaveTextContent('Fyll i vem som signerar')
    await user.type(screen.getByLabelText('Den som signerar'), 'Karl Ek')
    await user.type(screen.getByLabelText(/^Roll/), 'VD')
    await user.click(within(cart).getByRole('button', { name: 'Skicka förfrågan' }))
    expect(await within(cart).findByRole('alert')).toHaveTextContent('Bekräfta att den som signerar')
    await user.click(screen.getByRole('checkbox', { name: /rätt att teckna avtal/ }))
    await user.click(within(cart).getByRole('button', { name: 'Skicka förfrågan' }))
    expect(api.createRequest).toHaveBeenCalledWith('loc-1', expect.objectContaining({
      customerType: 'company', signatoryName: 'Karl Ek', signatoryRole: 'VD', signatoryAuthority: true,
      packages: [{ packageId: 'p1', quantity: 40 }],
    }))
  })

  it('shows the server error, for example outside the delivery area', async () => {
    const user = userEvent.setup()
    const { ApiError } = await import('../../shared/api')
    api.getSettings.mockResolvedValue(SETTINGS)
    api.getTiers.mockResolvedValue([])
    api.getCateringMenu.mockResolvedValue({ dishes: [{ dishId: 'd1', name: 'Kycklingspett', pricePerPortion: 85 }], packages: [] })
    api.getQuote.mockRejectedValue(new ApiError(409, 'catering_outside_area'))
    renderCalculator()
    await user.type(await screen.findByLabelText('Antal gäster'), '20')
    await user.type(screen.getByLabelText('Portioner Kycklingspett'), '20')
    const cart = screen.getByRole('complementary', { name: 'Kalkyl' })
    expect(await within(cart).findByText(/utanför restaurangens leveransområde/)).toBeInTheDocument()
  })

  it('says so when the restaurant has catering switched off', async () => {
    api.getSettings.mockResolvedValue({ ...SETTINGS, enabled: false })
    api.getTiers.mockResolvedValue([])
    api.getCateringMenu.mockResolvedValue({ dishes: [], packages: [] })
    getPublicMenu.mockResolvedValue([])
    render(<WithSite path="/catering"><CateringPage /></WithSite>)
    expect(await screen.findByText(/tar inte emot cateringförfrågningar/)).toBeInTheDocument()
  })
})

describe('CateringRequestPage', () => {
  it('shows the offer and signs it with BankID (QR, then complete)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.getRequest.mockResolvedValue(guest())
    api.startSigning.mockResolvedValue({ status: 'pending', qrData: 'bankid.a.0.b', autoStartToken: 'ast' })
    api.signingStatus
      .mockResolvedValueOnce({ status: 'pending', hintCode: 'outstandingTransaction', qrData: 'bankid.a.1.c' })
      .mockResolvedValueOnce({ status: 'complete', request: guest({ status: 'signed', canSign: false, canPay: true, signedBy: 'Anna Andersson' }) })
    renderGuest()
    expect(await screen.findByText('Din offert är klar')).toBeInTheDocument()
    expect(screen.getByText('”Välkommen!”')).toBeInTheDocument()
    expect(api.getRequest).toHaveBeenCalledWith('loc-1', 'req-1', 'tok-1')

    await user.click(screen.getByRole('button', { name: 'Signera med BankID' }))
    expect(await screen.findByAltText('QR-kod för BankID')).toHaveAttribute('src', 'data:qr,bankid.a.0.b')
    await act(async () => { vi.advanceTimersByTime(SIGN_POLL_MS) })
    expect(await screen.findByAltText('QR-kod för BankID')).toHaveAttribute('src', 'data:qr,bankid.a.1.c')
    await act(async () => { vi.advanceTimersByTime(SIGN_POLL_MS) })
    expect(await screen.findByText('Offerten är signerad')).toBeInTheDocument()
    expect(screen.getByText(/Signerad med BankID av Anna Andersson/)).toBeInTheDocument()
  })

  it('a private guest pays after signing, on the page', async () => {
    const user = userEvent.setup()
    api.getRequest.mockResolvedValue(guest({ status: 'signed', canSign: false, canPay: true }))
    api.startCheckout.mockResolvedValue({ clientSecret: 'cs_cat_secret', stripeAccount: 'acct_1' })
    confirm.mockResolvedValue({ type: 'success', session: {} })
    renderGuest()
    await user.click(await screen.findByRole('button', { name: /^Betala 1\s350 kr$/ }))
    expect(api.startCheckout).toHaveBeenCalledWith('loc-1', 'req-1', 'tok-1')
    expect(assign).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Betala cateringen' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /^Betala 1\s350 kr$/ }))
    expect(confirm).toHaveBeenCalledWith({ redirect: 'if_required' })
    expect(await screen.findByText(/Vi bekräftar betalningen/, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('asks for changes', async () => {
    const user = userEvent.setup()
    api.getRequest.mockResolvedValue(guest())
    api.requestChange.mockResolvedValue(guest({ status: 'change_requested', canSign: false, changeMessage: '40 portioner' }))
    renderGuest()
    await user.click(await screen.findByRole('button', { name: 'Be om ändringar' }))
    const box = screen.getByRole('group', { name: 'Be om ändringar' })
    await user.type(within(box).getByRole('textbox'), '40 portioner')
    await user.click(within(box).getByRole('button', { name: 'Skicka till restaurangen' }))
    expect(api.requestChange).toHaveBeenCalledWith('loc-1', 'req-1', 'tok-1', '40 portioner')
    expect(await screen.findByText('Restaurangen tittar på dina ändringar')).toBeInTheDocument()
  })

  it('shows the cleaning fee as its own line in the offer', async () => {
    const totals = { ...TOTALS, cleaningFee: 30000, total: 165000, vat: 17679 }
    api.getRequest.mockResolvedValue(guest({ equipmentReturn: 'not_cleaned',
      offer: { ...guest().offer!, totals, equipmentReturn: 'not_cleaned' } }))
    renderGuest()
    expect(await screen.findByText('Rengöringsavgift')).toBeInTheDocument()
    expect(screen.getAllByText('1 650 kr').length).toBeGreaterThan(0)
  })

  it('waits for the restaurant to sign before the guest can', async () => {
    api.getRequest.mockResolvedValue(guest({ canSign: false }))
    renderGuest()
    expect(await screen.findByText(/Restaurangen signerar offerten först/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Signera med BankID' })).not.toBeInTheDocument()
  })

  it("goes to the signing provider's page when it signs there", async () => {
    const user = userEvent.setup()
    api.getRequest.mockResolvedValue(guest())
    api.startSigning.mockResolvedValue({ status: 'pending', kind: 'redirect', url: 'https://sign.example/p/1' })
    renderGuest()
    await user.click(await screen.findByRole('button', { name: 'Signera med BankID' }))
    expect(assign).toHaveBeenCalledWith('https://sign.example/p/1')
  })

  it('a company accepts without BankID and downloads the signed copy', async () => {
    const user = userEvent.setup()
    api.getRequest.mockResolvedValue(guest({ customerType: 'company', companyName: 'Acme AB', canAccept: true,
      documents: ['offer'] }))
    api.acceptOffer.mockResolvedValue(guest({ status: 'signed', canSign: false, canAccept: false, customerType: 'company',
      signedBy: 'Karl Ek', signedMethod: 'simple_acceptance', documents: ['offer', 'signed'] }))
    api.documentLink.mockResolvedValue({ url: 'https://s3.example/signed.pdf' })
    renderGuest()
    await user.click(await screen.findByRole('button', { name: 'Godkänn utan BankID' }))
    const box = screen.getByRole('group', { name: 'Godkänn utan BankID' })
    await user.type(within(box).getByLabelText('Ditt namn'), 'Karl Ek')
    await user.click(within(box).getByRole('button', { name: 'Godkänn offerten' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fyll i din roll i företaget.')
    await user.type(within(box).getByLabelText('Din roll i företaget'), 'VD')
    await user.click(within(box).getByRole('checkbox', { name: /teckna avtal för Acme AB/ }))
    await user.click(within(box).getByRole('checkbox', { name: /Jag godkänner offerten/ }))
    await user.click(within(box).getByRole('button', { name: 'Godkänn offerten' }))
    expect(api.acceptOffer).toHaveBeenCalledWith('loc-1', 'req-1', 'tok-1',
      { name: 'Karl Ek', role: 'VD', confirmAuthority: true, acceptTerms: true })
    expect(await screen.findByText(/Godkänd av Karl Ek/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Signerad offert (PDF)' }))
    expect(api.documentLink).toHaveBeenCalledWith('loc-1', 'req-1', 'tok-1', 'signed')
    expect(assign).toHaveBeenCalledWith('https://s3.example/signed.pdf')
  })

  it('without a token it explains the link is incomplete', async () => {
    renderGuest('')
    expect(await screen.findByRole('alert')).toHaveTextContent('Länken är ofullständig')
    expect(api.getRequest).not.toHaveBeenCalled()
  })
})
