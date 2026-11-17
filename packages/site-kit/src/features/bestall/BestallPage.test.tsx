import { render, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BestallPage from './BestallPage'
import { loadCart } from './orderApi'
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

function config() {
  const c = siteConfig({ features: { reservations: true, ordering: true, catering: false, terminal: false } })
  c.stripe = { publishableKey: 'pk_test_1', accountId: 'acct_1' }
  c.locations[0].ordering = { pickup: true, table: true, prepMinutes: 20 }
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

type User = ReturnType<typeof userEvent.setup>

async function forward(user: User) {
  await user.click(screen.getByRole('button', { name: 'Fortsätt' }))
}

/** Kassan steg för steg: brickan, vem är du, kvitto, godkänn. */
async function fill(user: User) {
  await forward(user)
  await user.type(screen.getByLabelText('Namn'), 'Anna')
  await user.type(screen.getByLabelText(/Mobilnummer/), '070-123 45 67')
  await forward(user)
  await user.type(screen.getByLabelText(/E-post/), 'anna@example.se')
  await forward(user)
  await user.click(screen.getByRole('checkbox', { name: /inte kan ändras/ }))
}

function postedOrder() {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/order') && init?.method === 'POST')
  return call ? JSON.parse(String(call[1]!.body)) : null
}

describe('BestallPage', () => {
  it.each([
    ['the refetch fails', () => json({ error: 'down' }, 503)],
    ['the dish is still on the menu', () => json(MENU)],
  ])('keeps the neutral text and the cart when %s', async (_case, menuResponse) => {
    const user = userEvent.setup()
    orderResponse = () => json({ error: 'menu_item_unavailable' }, 400)
    render(
      <WithSite config={config()} path="/bestall">
        <Routes>
          <Route path="bestall" element={<BestallPage />} />
        </Routes>
      </WithSite>,
    )
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    await fill(user)
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/ordering')) return json(ordering)
      if (url.endsWith('/menu')) return menuResponse()
      if (url.endsWith('/order') && init?.method === 'POST') return orderResponse()
      return json({ error: 'not found' }, 404)
    })
    await user.click(screen.getByRole('button', { name: 'Till betalning · 125 kr' }))
    expect(
      await screen.findByText('En rätt i varukorgen finns inte längre på menyn. Ta bort den och försök igen.'),
    ).toBeInTheDocument()
    // The refetch has settled once the submit button is no longer busy.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Till betalning · 125 kr' })).not.toHaveClass('is-busy'))
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/menu')).length).toBeGreaterThan(1)
    expect(screen.queryByText(/har tagits bort/)).not.toBeInTheDocument()
    expect(loadCart('loc-1')).toEqual({ pizza: 1 })
  })

  it('drops a dish that expired before checkout by refetching the menu', async () => {
    const user = userEvent.setup()
    orderResponse = () => json({ error: 'menu_item_unavailable' }, 400)
    render(
      <WithSite config={config()} path="/bestall">
        <Routes>
          <Route path="bestall" element={<BestallPage />} />
        </Routes>
      </WithSite>,
    )
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    await user.click(screen.getByRole('button', { name: 'Lägg till Cola' }))
    await fill(user)
    // Margherita har gått ut när beställningen skickas.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/ordering')) return json(ordering)
      if (url.endsWith('/menu')) return json({ items: MENU.items.filter((d) => d.menuItemId !== 'pizza') })
      if (url.endsWith('/order') && init?.method === 'POST') return orderResponse()
      return json({ error: 'not found' }, 404)
    })
    await user.click(screen.getByRole('button', { name: 'Till betalning · 160,50 kr' }))
    expect(
      await screen.findByText('En rätt i varukorgen finns inte längre på menyn och har tagits bort. Kontrollera beställningen och försök igen.'),
    ).toBeInTheDocument()
    const cart = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(within(cart).queryByText('1 × Margherita')).not.toBeInTheDocument()
    expect(within(cart).getByText('1 × Cola')).toBeInTheDocument()
    expect(loadCart('loc-1')).toEqual({ cola: 1 })
  })

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
    expect(options.elementsOptions.appearance.variables).toMatchObject({ borderRadius: '3px', colorPrimary: '#1a120e' })
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
    expect(screen.getByRole('list', { name: 'Beställning: steg 1 av 4' })).toBeInTheDocument()
    await forward(user)
    expect(screen.getByRole('list', { name: 'Beställning: steg 2 av 4' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tillbaka' }))
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
      expect(screen.getByRole('button', { name: 'Fortsätt' })).toBeDisabled()
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
    ordering = { ...ordering, forTable: { label: '5', title: 'Bord 5' } }
    render(<WithSite config={config()} path="/bestall?bord=code-5"><BestallPage /></WithSite>)
    expect(await screen.findByText(/vi serverar vid bord 5/)).toBeInTheDocument()
    expect(screen.getByLabelText('Ditt bord: Bord 5')).toHaveTextContent('Bord 5')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/ordering?table=code-5'))).toBe(true)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Rödvin' }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(postedOrder()).toMatchObject({ mode: 'table', tableCode: 'code-5', items: [{ menuItemId: 'wine', quantity: 1 }] })
    // Pay first, like pickup: the browser names no table and nothing is left to pay later.
    expect(postedOrder()).not.toHaveProperty('payLater')
    expect(postedOrder()).not.toHaveProperty('tableLabel')
    expect(postedOrder()).toMatchObject({ embedded: true, acceptTerms: true })
    await user.click(await screen.findByRole('button', { name: /^Betala / }))
    expect(stripe.confirm).toHaveBeenCalledWith({ redirect: 'if_required' })
    expect(await screen.findByText('Betalt')).toBeInTheDocument()
  })

  it('sends a dish\'s wish and allergy with the order, for the kitchen ticket', async () => {
    const user = userEvent.setup()
    ordering = { ...ordering, forTable: { label: '5', title: 'Bord 5' } }
    render(<WithSite config={config()} path="/bestall?bord=code-5"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    await user.click(screen.getByText('Önskemål eller allergi?'))
    await user.type(screen.getByLabelText('Önskemål'), 'ingen lök')
    await user.type(screen.getByLabelText('Allergi'), 'jordnötsallergi')
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(postedOrder()).toMatchObject({
      items: [{ menuItemId: 'pizza', quantity: 1, note: 'ingen lök', allergy: 'jordnötsallergi' }],
    })
  })

  it('names a renamed table by its name', async () => {
    ordering = { ...ordering, forTable: { label: 'Terrassen', title: 'Terrassen' } }
    render(<WithSite config={config()} path="/bestall?bord=code-t"><BestallPage /></WithSite>)
    expect(await screen.findByText(/vi serverar vid Terrassen/)).toBeInTheDocument()
  })

  it.each([
    ['table code revoked', /QR-koden gäller inte längre/],
    ['table removed', /Bordet med den här QR-koden finns inte längre/],
  ])('explains a %s code and blocks ordering', async (error, message) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/ordering')) return json({ error }, 400)
      if (url.endsWith('/menu')) return json(MENU)
      return json({ error: 'not found' }, 404)
    })
    render(<WithSite config={config()} path="/bestall?bord=old-code"><BestallPage /></WithSite>)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(await screen.findByRole('button', { name: 'Lägg till Margherita' })).toBeDisabled()
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

  it('checks the guest before sending, with no bot check field in the order', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    await forward(user)
    await forward(user)
    expect(screen.getByRole('alert')).toHaveTextContent('Fyll i ditt namn.')
    expect(screen.queryByLabelText(/E-post/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await forward(user)
    expect(screen.getByRole('alert')).toHaveTextContent('giltigt mobilnummer')
    await user.type(screen.getByLabelText(/Mobilnummer/), '070-123 45 67')
    await forward(user)
    await forward(user)
    expect(screen.getByRole('alert')).toHaveTextContent('giltig e-postadress')
    await user.type(screen.getByLabelText(/E-post/), 'anna@example.se')
    await forward(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Godkänn villkoren')
    await user.click(screen.getByRole('checkbox', { name: /inte kan ändras/ }))
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    await waitFor(() => expect(postedOrder()).not.toBeNull())
    expect(postedOrder()).toMatchObject({ name: 'Anna', email: 'anna@example.se', acceptTerms: true })
    expect(Object.keys(postedOrder()).some((k) => /token/i.test(k))).toBe(false)
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

  it('shows one step at a time and keeps what the guest typed when going back', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    expect(screen.queryByLabelText('Namn')).not.toBeInTheDocument()
    await forward(user)
    const who = screen.getByRole('heading', { name: 'Vem är du?' })
    expect(who).toHaveFocus()
    // Sammanfattningen syns hela vägen: rad, delsumma, moms och totalt.
    const cart = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(within(cart).getByText('35,50 kr × 1')).toBeInTheDocument()
    expect(within(cart).getByText('Delsumma')).toBeInTheDocument()
    expect(within(cart).getByText(/^Varav moms (6|12) %$/)).toBeInTheDocument()
    expect(within(cart).getByText('Totalt').nextSibling).toHaveTextContent('35,50 kr')
    // Mobilens "Visa beställning" har samma summa.
    expect(screen.getByText('Visa beställning').nextSibling).toHaveTextContent('35,50 kr')
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText(/Mobilnummer/), '070-123 45 67')
    await forward(user)
    expect(screen.getByRole('heading', { name: 'Kvitto och önskemål' })).toHaveFocus()
    expect(screen.queryByLabelText('Namn')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/E-post/), 'anna@example.se')
    await user.click(screen.getByRole('button', { name: 'Tillbaka' }))
    expect(screen.getByLabelText('Namn')).toHaveValue('Anna')
    await user.clear(screen.getByLabelText('Namn'))
    await user.type(screen.getByLabelText('Namn'), 'Anna B')
    await forward(user)
    expect(screen.getByLabelText(/E-post/)).toHaveValue('anna@example.se')
    await forward(user)
    // Villkor och samtycke är två olika rutor; ingen är ikryssad.
    expect(screen.getByRole('checkbox', { name: /inte kan ändras/ })).not.toBeChecked()
    expect(screen.getByText('Läs mer')).toBeInTheDocument()
    expect(screen.getByText(/personuppgiftsansvarig/)).toBeInTheDocument()
    // Inget av gästens uppgifter sparas innan beställningen skickas.
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('Anna')
    expect(postedOrder()).toBeNull()
    // Ett klick från sista steget leder tillbaka till brickan bredvid menyn
    // (knappen finns både i sidospalten och i mobilens utfällbara sammanfattning).
    await user.click(screen.getAllByRole('button', { name: 'Ändra varukorgen' })[0])
    expect(screen.getByRole('heading', { name: 'Din beställning' })).toHaveFocus()
    const tray = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(within(tray).getByText('1 × Cola')).toBeInTheDocument()
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
    await fill(user)
    expect(screen.getByRole('checkbox', { name: /Skicka mig erbjudanden/ })).not.toBeChecked()
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

describe('BestallPage options, allergens and categories', () => {
  const OPTION_MENU = {
    items: [
      { menuItemId: 'pizza', name: 'Margherita', description: '', price: 125, category: 'cpizza', imageKey: null,
        allergens: ['gluten', 'milk'],
        options: [
          { name: 'Storlek', required: true, maxChoices: 1,
            choices: [{ name: 'Normal', price: 0 }, { name: 'Stor', price: 30 }] },
          { name: 'Extra', required: false, maxChoices: 2,
            choices: [{ name: 'Ost', price: 10.5 }, { name: 'Skinka', price: 15 }, { name: 'Oliver', price: 5 }] },
        ] },
      { menuItemId: 'ipa', name: 'IPA', description: '', price: 79, category: 'col', imageKey: 'k' },
    ],
    categories: [{ categoryId: 'cpizza', name: 'Pizzor' }, { categoryId: 'col', name: 'Öl' }],
  }

  it('groups by the restaurant\'s categories, shows allergens and sends the chosen options', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/ordering')) return json(ordering)
      if (url.endsWith('/menu')) return json(OPTION_MENU)
      if (url.endsWith('/order') && init?.method === 'POST') return orderResponse()
      return json({ error: 'not found' }, 404)
    })
    render(
      <WithSite config={config()} path="/bestall">
        <Routes>
          <Route path="bestall" element={<BestallPage />} />
        </Routes>
      </WithSite>,
    )
    expect(await screen.findByRole('heading', { name: 'Pizzor' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Öl' })).toBeInTheDocument()
    expect(screen.getByText('Innehåller: Gluten, Mjölk')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Välj tillval och lägg till Margherita' }))
    const dialog = screen.getByRole('dialog', { name: 'Margherita' })
    await user.click(within(dialog).getByRole('radio', { name: /Stor/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Ost/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Skinka/ }))
    // max two extras
    expect(within(dialog).getByRole('checkbox', { name: /Oliver/ })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /Lägg till · 180,50 kr/ }))

    expect(screen.getAllByText('Stor, Ost, Skinka').length).toBeGreaterThan(0)
    await fill(user)
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    await waitFor(() => expect(postedOrder()).not.toBeNull())
    expect(postedOrder().items).toEqual([{
      menuItemId: 'pizza', quantity: 1,
      options: [{ group: 'Storlek', choice: 'Stor' }, { group: 'Extra', choice: 'Ost' }, { group: 'Extra', choice: 'Skinka' }],
    }])
  })

  it('lets the guest pick and unpick a paid choice in an optional one-choice group', async () => {
    const user = userEvent.setup()
    const menu = {
      items: [{ menuItemId: 'burger', name: 'Burgare', description: '', price: 150, category: 'mains', imageKey: null,
        options: [{ name: 'Extra', required: false, maxChoices: 1,
          choices: [{ name: 'Extra ost', price: 15 }, { name: 'Bacon', price: 20 }] }] }],
    }
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/ordering')) return json(ordering)
      if (url.endsWith('/menu')) return json(menu)
      return json({ error: 'not found' }, 404)
    })
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Välj tillval och lägg till Burgare' }))
    const dialog = screen.getByRole('dialog', { name: 'Burgare' })
    expect(within(dialog).getByRole('radio', { name: 'Inget' })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: /Lägg till · 150 kr/ })).toBeEnabled()
    await user.click(within(dialog).getByRole('radio', { name: /Extra ost/ }))
    expect(within(dialog).getByRole('button', { name: /Lägg till · 165 kr/ })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'Inget' }))
    expect(within(dialog).getByRole('radio', { name: /Extra ost/ })).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: /Lägg till · 150 kr/ })).toBeEnabled()
  })
})

describe('BestallPage gift card, field errors and loading', () => {
  function giftConfig() {
    const c = config()
    c.tenant.features = { ...c.tenant.features, giftCards: true }
    return c
  }

  it('goes straight to the status page when the gift card covers the whole order', async () => {
    const user = userEvent.setup()
    orderResponse = () => json({ orderId: 'o'.repeat(32), locationId: 'loc-1', statusToken: 'tok', totalAmount: 12500,
      giftCard: { last4: '1234', debitedOre: 12500 }, chargedAmount: 0 }, 201)
    render(
      <WithSite config={config()} path="/bestall">
        <Routes>
          <Route path="bestall" element={<BestallPage />} />
          <Route path="bestallning/:locationId/:orderId" element={<p>Statussidan</p>} />
        </Routes>
      </WithSite>,
    )
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Till betalning · 125 kr' }))
    expect(await screen.findByText('Statussidan')).toBeInTheDocument()
    expect(stripe.provider).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('order-cart:loc-1')).toBeNull()
    expect(sessionStorage.getItem(`order-token:${'o'.repeat(32)}`)).toBe('tok')
  })

  it('charges only the rest after a partial gift card and shows the card in the summary', async () => {
    const user = userEvent.setup()
    orderResponse = () => json({ orderId: 'o'.repeat(32), locationId: 'loc-1', clientSecret: 'cs_test_secret',
      stripeAccount: 'acct_1', statusToken: 'tok', totalAmount: 12500,
      giftCard: { last4: '1234', debitedOre: 10000 }, chargedAmount: 2500 }, 201)
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Margherita' }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Till betalning · 125 kr' }))
    expect(await screen.findByRole('button', { name: 'Betala 25 kr' })).toBeInTheDocument()
    const side = screen.getByRole('complementary', { name: 'Din beställning' })
    expect(within(side).getByText('Presentkort ****1234').nextSibling).toHaveTextContent('-100 kr')
    expect(within(side).getByText('Totalt').nextSibling).toHaveTextContent('25 kr')
  })

  it('names a refused gift card and puts the guest back in the code field', async () => {
    const user = userEvent.setup()
    orderResponse = () => json({ error: 'gift_card_not_found' }, 409)
    render(<WithSite config={giftConfig()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    await fill(user)
    await user.click(await screen.findByRole('button', { name: 'Har du ett presentkort?' }))
    await user.type(screen.getByLabelText(/Presentkortskod/), 'abcd-efgh-ijkl-mnop')
    await user.click(screen.getByRole('button', { name: /Till betalning/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Presentkortskoden känns inte igen. Kontrollera koden.')
    const field = screen.getByLabelText(/Presentkortskod/)
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAttribute('aria-describedby', 'order-error')
  })

  it('marks and focuses the field that is missing', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: 'Lägg till Cola' }))
    await forward(user)
    await forward(user)
    const name = screen.getByLabelText('Namn')
    expect(name).toHaveFocus()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAttribute('aria-describedby', 'order-error')
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'order-error')
    await user.type(name, 'Anna')
    await forward(user)
    const phone = screen.getByLabelText(/Mobilnummer/)
    expect(phone).toHaveFocus()
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(name).not.toHaveAttribute('aria-invalid')
  })

  it('offers to try again in place when the menu cannot be loaded', async () => {
    const user = userEvent.setup()
    let menuFails = true
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/ordering')) return json(ordering)
      if (url.endsWith('/menu')) return menuFails ? json({ error: 'down' }, 503) : json(MENU)
      return json({ error: 'not found' }, 404)
    })
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Vi kunde inte hämta menyn just nu. Försök igen')
    menuFails = false
    await user.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('button', { name: 'Lägg till Margherita' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not blame sending when the ordering state cannot be loaded', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/ordering')) return json({ error: 'boom' }, 500)
      if (url.endsWith('/menu')) return json(MENU)
      return json({ error: 'not found' }, 404)
    })
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Vi kunde inte hämta menyn just nu')
    expect(alert).not.toHaveTextContent('skickas')
    expect(within(alert).getByRole('button', { name: 'Försök igen' })).toBeInTheDocument()
  })

  it('shows the step rail and marks the first category chip as current', async () => {
    render(<WithSite config={config()} path="/bestall"><BestallPage /></WithSite>)
    const rail = screen.getByRole('list', { name: 'Beställning: steg 1 av 4' })
    expect(rail).toHaveClass('flow')
    const nav = await screen.findByRole('navigation', { name: 'Kategorier' })
    const chips = within(nav).getAllByRole('link')
    expect(chips[0]).toHaveClass('is-active')
    expect(chips[0]).toHaveAttribute('aria-current', 'true')
    expect(chips[1]).not.toHaveClass('is-active')
  })
})
