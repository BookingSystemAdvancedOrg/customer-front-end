import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CateringPage from './CateringPage'
import CateringRequestPage, { SIGN_POLL_MS } from './CateringRequestPage'
import { estimate, firstDate, tokenFor } from './cateringApi'
import type { CateringSettings, GuestRequest, Tier } from './cateringApi'
import { WithSite } from '../../test/siteFixture'
import { SiteContext } from '../../shared/SiteContext'
import { siteConfig } from '../../test/siteData'

const api = vi.hoisted(() => ({
  getSettings: vi.fn(), getTiers: vi.fn(), createRequest: vi.fn(), getRequest: vi.fn(),
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
  allowOutsideArea: false, terms: 'Villkor', offerValidDays: 7, paymentTermsDays: 30,
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

describe('catering pricing helpers', () => {
  it('applies the matching tier to the dishes and adds delivery', () => {
    const r = estimate([{ price: 50, quantity: 30 }], TIERS, 395)
    expect(r).toMatchObject({ portions: 30, subtotal: 150000, discount: 15000, deliveryFee: 39500, total: 174500 })
    expect(estimate([{ price: 50, quantity: 29 }], TIERS, 0).discount).toBe(0)
  })

  it('first date is advanceDays after today in Stockholm', () => {
    expect(firstDate(5, new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-18')
  })

  it('keeps the link token in the tab', () => {
    expect(tokenFor('req-1', '#t=abc')).toBe('abc')
    expect(tokenFor('req-1', '')).toBe('abc')
  })
})

describe('CateringPage', () => {
  it('prices the choice, shows the discount and sends the request', async () => {
    const user = userEvent.setup()
    api.getSettings.mockResolvedValue(SETTINGS)
    api.getTiers.mockResolvedValue(TIERS)
    getPublicMenu.mockResolvedValue([
      { menuItemId: 'm1', name: 'Lasagne', description: '', price: 50, category: 'mains' },
      { menuItemId: 'w1', name: 'Vin', description: '', price: 95, category: 'drinks', alcohol: true },
    ])
    api.createRequest.mockResolvedValue({ requestId: 'req-9', locationId: 'loc-1', token: 'tok-9' })
    const config = siteConfig({ features: { reservations: true, ordering: false, catering: true, terminal: false } })
    render(
      <WithSite config={config} path="/catering">
        <Routes>
          <Route path="/catering" element={<CateringPage />} />
          <Route path="/catering/:locationId/:requestId" element={<p>Skickad sida</p>} />
        </Routes>
      </WithSite>,
    )
    const input = await screen.findByLabelText('Portioner Lasagne')
    expect(screen.queryByLabelText('Portioner Vin')).not.toBeInTheDocument()
    await user.type(input, '30')
    const cart = screen.getByRole('complementary', { name: 'Kalkyl' })
    expect(within(cart).getByText(/Rabatt Nivå 1/)).toBeInTheDocument()
    expect(within(cart).getByText('1 350 kr')).toBeInTheDocument()

    await user.click(within(cart).getByRole('button', { name: 'Skicka förfrågan' }))
    expect(await within(cart).findByRole('alert')).toHaveTextContent('Fyll i ditt namn.')
    await user.type(screen.getByLabelText('Namn'), 'Anna Andersson')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Mobilnummer'), '070-123 45 67')
    await user.click(within(cart).getByRole('checkbox'))
    await user.click(within(cart).getByRole('button', { name: 'Skicka förfrågan' }))
    expect(api.createRequest).toHaveBeenCalledWith('loc-1', expect.objectContaining({
      items: [{ menuItemId: 'm1', quantity: 30 }], customerType: 'private', fulfilment: 'pickup',
      name: 'Anna Andersson', acceptTerms: true,
    }))
    expect(await screen.findByText('Skickad sida')).toBeInTheDocument()
    expect(sessionStorage.length).toBeGreaterThan(0)
  })

  it('says so when the restaurant has catering switched off', async () => {
    api.getSettings.mockResolvedValue({ ...SETTINGS, enabled: false })
    api.getTiers.mockResolvedValue([])
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

  it('without a token it explains the link is incomplete', async () => {
    renderGuest('')
    expect(await screen.findByRole('alert')).toHaveTextContent('Länken är ofullständig')
    expect(api.getRequest).not.toHaveBeenCalled()
  })
})
