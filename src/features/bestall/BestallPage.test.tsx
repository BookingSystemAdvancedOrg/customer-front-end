import { render, screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BestallPage from './BestallPage'
import { WithSite } from '../../test/siteFixture'
import { json, siteConfig } from '../../test/siteData'

const stripe = vi.hoisted(() => ({
  confirm: vi.fn(),
  provider: vi.fn(),
}))
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(async () => ({})) }))
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children, options }: { children: React.ReactNode; options: unknown }) => {
    stripe.provider(options)
    return <div data-testid="stripe-checkout">{children}</div>
  },
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    queueMicrotask(() => onReady?.())
    return <div>Stripes betalformulär</div>
  },
  useCheckoutElements: () => ({ type: 'success', checkout: { confirm: stripe.confirm } }),
}))

vi.mock('../boka/TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken, action }: { onToken: (t: string | null) => void; action: string }) => (
    <button type="button" onClick={() => onToken(`token-${action}`)}>
      Jag är inte en robot
    </button>
  ),
}))

const MENU = {
  items: [
    { menuItemId: 'pizza', name: 'Margherita', description: '', price: 125, category: 'mains', imageKey: 'k' },
    { menuItemId: 'cola', name: 'Cola', description: '', price: 35.5, category: 'drinks', imageKey: 'k' },
    { menuItemId: 'wine', name: 'Rödvin', description: '', price: 95, category: 'drinks', imageKey: 'k', alcohol: true },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>
let ordering: Record<string, unknown>
let orderResponse: () => Response
const assign = vi.fn()

function config(turnstile: string | null = null) {
  const c = siteConfig({ features: { reservations: true, ordering: true, catering: false, terminal: false } })
  c.stripe = { publishableKey: 'pk_test_1', accountId: 'acct_1' }
  c.locations[0].ordering = { pickup: true, table: true, prepMinutes: 20 }
  c.turnstile = { siteKey: turnstile }
  return c
}

beforeEach(() => {
  sessionStorage.clear()
  ordering = { open: true, pickup: true, table: true, prepMinutes: 20, lastOrderAt: '21:45' }
  orderResponse = () => json({ orderId: 'o'.repeat(32), locationId: 'loc-1', clientSecret: 'cs_test_secret',
    stripeAccount: 'acct_1', statusToken: 'tok', totalAmount: 28550 }, 201)
  stripe.confirm.mockReset().mockResolvedValue({ type: 'success', session: {} })
  stripe.provider.mockReset()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/ordering')) return json(ordering)
    if (url.endsWith('/menu')) return json(MENU)
    if (url.endsWith('/order') && init?.method === 'POST') return orderResponse()
    return json({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  assign.mockReset()
  vi.stubGlobal('location', { ...window.location, assign })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Namn'), 'Anna')
  await user.type(screen.getByLabelText(/Mobilnummer/), '070-123 45 67')
  await user.type(screen.getByLabelText('E-post (kvitto)'), 'anna@example.se')
  await user.click(screen.getByRole('checkbox'))
}

function postedOrder() {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/order') && init?.method === 'POST')
  return call ? JSON.parse(String(call[1]!.body)) : null
}

describe('BestallPage', () => {
  it('orders for pickup and pays on the page with Stripe in the site style', async () => {
    const user = userEvent.setup()
    render(
      <WithSite config={config()} path="/bestall">
        <Routes>
          <Route path="bestall" element={<BestallPage />} />
          <Route path="bestallning/:locationId/:orderId" element={<p>Statussidan</p>} />
        </Routes>
      </WithSite>,
    )
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    await user.click(screen.getAllByRole('button', { name: 'En Margherita till' })[0])
    await user.click(screen.getByRole('button', { name: 'Lägg till Cola' }))
    const cart = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(within(cart).getByText('2 × Margherita')).toBeInTheDocument()
    expect(within(cart).getByText('285,50 kr')).toBeInTheDocument()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Till betalning · 285,50 kr' }))
    expect(postedOrder()).toEqual({
      locationId: 'loc-1', mode: 'pickup', items: [{ menuItemId: 'pizza', quantity: 2 }, { menuItemId: 'cola', quantity: 1 }],
      name: 'Anna', phone: '+46701234567', email: 'anna@example.se', language: 'sv', acceptTerms: true,
      embedded: true,
    })
    expect(assign).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(`order-token:${'o'.repeat(32)}`)).toBe('tok')

    // Steg 3: kvittot med Stripes formulär, i sajtens typsnitt och färger, på svenska.
    expect(await screen.findByRole('heading', { name: 'Din beställning' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Beställning: steg 3 av 4' })).toBeInTheDocument()
    const options = stripe.provider.mock.calls[0][0]
    expect(options.clientSecret).toBe('cs_test_secret')
    expect(options.elementsOptions.loader).toBe('never')
    expect(options.elementsOptions.appearance.variables).toMatchObject({ borderRadius: '3px', colorPrimary: '#350001' })
    expect(options.elementsOptions.fonts.map((f: { family: string }) => f.family)).toContain('Martian Mono')
    const loadStripe = (await import('@stripe/stripe-js')).loadStripe
    expect(loadStripe).toHaveBeenCalledWith('pk_test_1', { stripeAccount: 'acct_1', locale: 'sv' })

    await user.click(await screen.findByRole('button', { name: 'Betala 285,50 kr' }))
    expect(stripe.confirm).toHaveBeenCalledWith({ redirect: 'if_required' })
    expect(await screen.findByText('Betalt')).toBeInTheDocument()
    expect(await screen.findByText('Statussidan', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(sessionStorage.getItem('order-cart:loc-1')).toBeNull()
  })

  it('shows a declined card on the payment ticket and keeps the cart for going back', async () => {
    const user = userEvent.setup()
    stripe.confirm.mockResolvedValue({ type: 'error', error: { message: 'Kortet nekades.' } })
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    await user.click(await screen.findByRole('button', { name: 'Betala 285,50 kr' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kortet nekades.')
    expect(screen.getByRole('button', { name: 'Betala 285,50 kr' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Ändra beställningen' }))
    const cart = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(within(cart).getByText('1 × Cola')).toBeInTheDocument()
  })

  it('moves the step row to payment once the order is registered', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    expect(screen.getByRole('list', { name: 'Beställning: steg 1 av 4' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    expect(screen.getByRole('list', { name: 'Beställning: steg 2 av 4' })).toBeInTheDocument()
    await fill(user)
    expect(screen.getByRole('list', { name: 'Beställning: steg 3 av 4' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(await screen.findByRole('heading', { name: 'Betala' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Beställning: steg 3 av 4' })).toBeInTheDocument()
    expect(screen.getByText(/sparas aldrig hos oss/)).toBeInTheDocument()
  })

  it('blocks an order above 50 000 kr before sending it', async () => {
    const user = userEvent.setup()
    MENU.items.push({ menuItemId: 'car', name: 'Porsche', description: '', price: 3500000, category: 'mains', imageKey: 'k' })
    try {
      render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
      await user.click(await screen.findByRole('button', { name: 'Lägg till Porsche' }))
      expect(screen.getByRole('alert')).toHaveTextContent('för stor för att betalas online (högst 50 000 kr)')
      expect(screen.getByRole('button', { name: /^Till betalning/ })).toBeDisabled()
      expect(postedOrder()).toBeNull()
    } finally {
      MENU.items.pop()
    }
  })

  it('never goes above 20 of a dish', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    const plus = screen.getAllByRole('button', { name: 'En Margherita till' })[0]
    for (let i = 0; i < 25; i++) if (!(plus as HTMLButtonElement).disabled) await user.click(plus)
    expect(within(screen.getByRole('group', { name: 'Antal Margherita' })).getByText('20')).toBeInTheDocument()
    expect(plus).toBeDisabled()
  })

  it('keeps alcohol for table orders and names the table from the QR code', async () => {
    const user = userEvent.setup()
    ordering = { ...ordering, forTable: { label: '5' } }
    render(<WithSite config={config()} path="/bestall?bord=code-5"><BestallPage /></WithSite>)
    expect(await screen.findByText(/vi serverar vid bord 5/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/ordering?table=code-5'))).toBe(true)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Rödvin' }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(postedOrder()).toMatchObject({ mode: 'table', tableCode: 'code-5', items: [{ menuItemId: 'wine', quantity: 1 }] })
  })

  it('shows alcohol as table-only for pickup', async () => {
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    expect(await screen.findByText('Bara vid bordet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lägg till Rödvin' })).not.toBeInTheDocument()
  })

  it('says when ordering is closed and blocks payment', async () => {
    ordering = { open: false, reason: 'closed', pickup: true, table: true }
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    expect(await screen.findByText(/utanför öppettiderna/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Lägg till Margherita' })).toBeDisabled()
  })

  it('checks the guest before sending and sends the bot check with the order action', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config('site-key')} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Fyll i ditt namn.')
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('säkerhetskontrollen')
    await user.click(screen.getByRole('button', { name: 'Jag är inte en robot' }))
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(postedOrder()).toMatchObject({ turnstileToken: 'token-order' })
  })

  it('explains a closed kitchen from the server', async () => {
    const user = userEvent.setup()
    orderResponse = () => json({ error: 'ordering_paused' }, 409)
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Köket har pausat')
    expect(assign).not.toHaveBeenCalled()
  })

  it('keeps the cart after a cancelled payment', async () => {
    sessionStorage.setItem('order-cart:loc-1', JSON.stringify({ pizza: 3, junk: 99 }))
    render(<WithSite config={config()} path="/bestall?avbruten=abc"><BestallPage /></WithSite>)
    expect(await screen.findByText(/Betalningen avbröts/)).toBeInTheDocument()
    const cart = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(await within(cart).findByText('3 × Margherita')).toBeInTheDocument()
  })
})

describe('BestallPage discount code', () => {
  function marketingConfig() {
    const c = config()
    c.tenant.features = { ...c.tenant.features, marketing: true }
    return c
  }

  it('applies the code from the email link and sends it with the order', async () => {
    const user = userEvent.setup()
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/m/code')) {
        return json({ code: 'ABCD-EFGH', percent: 10, minOrderOre: 0, expiresAt: '2026-11-18T10:00:00Z' })
      }
      return base(url, init)
    })
    render(<WithSite config={marketingConfig()} path="/bestall?kod=abcdefgh"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    const cart = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(await within(cart).findByText('Rabatt 10 % (ABCD-EFGH)')).toBeInTheDocument()
    expect(within(cart).getByText('-12,50 kr')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText(/Mobilnummer/), '070-123 45 67')
    await user.type(screen.getByLabelText('E-post (kvitto)'), 'anna@example.se')
    await user.click(screen.getByRole('checkbox', { name: /inte kan ändras/ }))
    await user.click(screen.getByRole('checkbox', { name: /Skicka mig erbjudanden/ }))
    await user.click(screen.getByRole('button', { name: 'Till betalning · 112,50 kr' }))
    expect(postedOrder()).toMatchObject({ discountCode: 'ABCD-EFGH', marketingOptIn: true })
  })

  it('explains a code that cannot be used', async () => {
    const user = userEvent.setup()
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/m/code')) return json({ error: 'discount_used' }, 409)
      return base(url, init)
    })
    render(<WithSite config={marketingConfig()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    await user.click(screen.getByRole('button', { name: 'Har du en rabattkod?' }))
    await user.type(screen.getByLabelText('Rabattkod'), 'abcd-efgh')
    await user.click(screen.getByRole('button', { name: 'Använd' }))
    expect(await screen.findByText('Koden är redan använd.')).toBeInTheDocument()
  })
})
