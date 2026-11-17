import { act, render, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NotanPage, { BILL_POLL_MS } from './NotanPage'
import { WithSite } from '../../test/siteFixture'
import { json, siteConfig } from '../../test/siteData'

const stripe = vi.hoisted(() => ({ confirm: vi.fn(), provider: vi.fn() }))
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

const ORDER = 'o'.repeat(32)
const BILL_ID = 'b'.repeat(32)

function bill(extra: Record<string, unknown> = {}) {
  return {
    tableTitle: 'Bord 7', serviceDate: '2026-11-17', status: 'open', amount: 45000, count: 2, currency: 'sek', minChargeOre: 300,
    orders: [
      { number: 12, createdAt: '2026-11-17T13:05:00Z', total: 21500, lines: [{ name: 'Burgarmeny (Stor)', quantity: 1, total: 21500, vatRate: 12 }] },
      { number: 15, createdAt: '2026-11-17T13:40:00Z', total: 23500, lines: [{ name: 'Rödvin', quantity: 2, total: 23500, vatRate: 25 }] },
    ],
    vat: [{ rate: 12, gross: 21500, net: 19196, vat: 2304 }, { rate: 25, gross: 23500, net: 18800, vat: 4700 }],
    location: { name: 'City' },
    ...extra,
  }
}

const started = { billId: BILL_ID, billToken: 'bill-tok', clientSecret: 'cs_test_bill', stripeAccount: 'acct_1', amount: 45000, count: 2 }

let fetchMock: ReturnType<typeof vi.fn>
let view: () => Response
let payResponse: () => Response
let paidStatuses: Record<string, unknown>[]

function config() {
  const c = siteConfig({ features: { reservations: true, ordering: true, catering: false, terminal: false } })
  c.stripe = { publishableKey: 'pk_test_1', accountId: 'acct_1' }
  return c
}

function renderAt(path: string, hash = '') {
  window.history.replaceState(null, '', `${path}${hash}`)
  return render(
    <WithSite config={config()} path={path}>
      <Routes>
        <Route path="notan/:locationId" element={<NotanPage />} />
        <Route path="notan/:locationId/:orderId" element={<NotanPage />} />
      </Routes>
    </WithSite>,
  )
}

function calls(match: (url: string, init?: RequestInit) => boolean) {
  return fetchMock.mock.calls.filter(([url, init]) => match(String(url), init as RequestInit | undefined))
}

beforeEach(() => {
  sessionStorage.clear()
  view = () => json(bill())
  payResponse = () => json(started, 201)
  paidStatuses = [{ billId: BILL_ID, status: 'paid', amount: 45000, tableTitle: 'Bord 7', paidAt: '2026-11-17T14:00:00Z',
    orders: bill().orders, vat: bill().vat }]
  stripe.confirm.mockReset().mockResolvedValue({ type: 'success', session: {} })
  stripe.provider.mockReset()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/table-bill/pay') || url.includes('/table-bill/pay?')) return payResponse()
    if (url.includes(`/table-bill/${BILL_ID}`)) return json(paidStatuses.length > 1 ? paidStatuses.shift() : paidStatuses[0])
    if (url.includes('/table-bill') && (!init?.method || init.method === 'GET')) return view()
    return json({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('NotanPage', () => {
  it('shows the whole table bill from the staff pay link, with no personal data asked', async () => {
    renderAt('/notan/loc-1', '#L.payload.sig')
    expect(screen.getByRole('status', { name: 'Hämtar notan' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Notan för bord 7' })).toBeInTheDocument()
    expect(screen.getByText('#12')).toBeInTheDocument()
    expect(screen.getByText('1 × Burgarmeny (Stor)')).toBeInTheDocument()
    expect(screen.getByText('2 × Rödvin')).toBeInTheDocument()
    expect(screen.getByText('Varav moms 12 %').nextSibling).toHaveTextContent('23,04 kr')
    expect(screen.getByText('Att betala').nextSibling).toHaveTextContent('450 kr')
    expect(screen.getByLabelText(/Kvitto till e-post \(valfritt\)/)).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/locations\/loc-1\/table-bill$/)
    expect((init as RequestInit).headers).toMatchObject({ 'X-Order-Token': 'L.payload.sig' })
  })

  it('pays the bill with Stripe and stamps it paid once the server confirms', async () => {
    const user = userEvent.setup()
    renderAt('/notan/loc-1', '#L.payload.sig')
    await user.type(await screen.findByLabelText(/Kvitto till e-post/), 'gast@example.se')
    await user.click(screen.getByRole('button', { name: 'Betala 450 kr' }))
    const [[, init]] = calls((url, i) => url.includes('/table-bill/pay') && i?.method === 'POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ expectedAmount: 45000, email: 'gast@example.se' })
    expect((init as RequestInit).headers).toMatchObject({ 'X-Order-Token': 'L.payload.sig' })
    expect(await screen.findByRole('heading', { name: 'Betala notan' })).toBeInTheDocument()
    expect(stripe.provider.mock.calls[0][0]).toMatchObject({ clientSecret: 'cs_test_bill' })
    await user.click(await screen.findByRole('button', { name: 'Betala 450 kr' }))
    expect(await screen.findByText('Tack! Notan är betald. Visa den här sidan om personalen frågar.', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText('Betald')).toHaveClass('stamp-ok')
    const [[, pollInit]] = calls((url) => url.includes(`/table-bill/${BILL_ID}`))
    expect((pollInit as RequestInit).headers).toMatchObject({ 'X-Order-Token': 'bill-tok' })
    expect(sessionStorage.getItem('table-bill-pay:loc-1')).toBeNull()
  })

  it('reads the bill with the order token from the status page', async () => {
    sessionStorage.setItem(`order-token:${ORDER}`, 'order-tok')
    renderAt(`/notan/loc-1/${ORDER}`)
    expect(await screen.findByRole('heading', { name: 'Notan för bord 7' })).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`/table-bill?order=${ORDER}`)
    expect((init as RequestInit).headers).toMatchObject({ 'X-Order-Token': 'order-tok' })
  })

  it('refreshes the amount when a new order came in and asks to pay again', async () => {
    const user = userEvent.setup()
    payResponse = () => json({ error: 'bill_changed', bill: bill({ amount: 52000, count: 3 }) }, 409)
    renderAt('/notan/loc-1', '#L.payload.sig')
    await user.click(await screen.findByRole('button', { name: 'Betala 450 kr' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Notan har ändrats, en ny beställning har kommit till. Kolla beloppet och tryck Betala igen.')
    expect(screen.getByRole('button', { name: 'Betala 520 kr' })).toBeInTheDocument()
  })

  it('says someone else is paying and offers to try again', async () => {
    view = () => json(bill({ status: 'paying', paying: { startedAt: '2026-11-17T14:00:00Z', retryAfter: 80 } }))
    renderAt('/notan/loc-1', '#L.payload.sig')
    expect(await screen.findByText('Någon vid bordet betalar notan just nu. Vänta en minut och försök igen, eller fråga personalen.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeInTheDocument()
  })

  it('resumes its own started payment after going back', async () => {
    const user = userEvent.setup()
    renderAt('/notan/loc-1', '#L.payload.sig')
    await user.click(await screen.findByRole('button', { name: 'Betala 450 kr' }))
    await user.click(await screen.findByRole('button', { name: 'Tillbaka till notan' }))
    view = () => json(bill({ status: 'paying' }))
    payResponse = () => json(started, 200)
    await user.click(await screen.findByRole('button', { name: 'Betala 450 kr' }))
    const posts = calls((url, i) => url.includes('/table-bill/pay') && i?.method === 'POST')
    expect(JSON.parse(String((posts[1][1] as RequestInit).body))).toEqual({
      expectedAmount: 45000, resumeBillId: BILL_ID, resumeToken: 'bill-tok',
    })
  })

  it.each([
    ['bill_paid', 409, 'Notan är redan betald.'],
    ['bill_below_minimum', 409, 'Beloppet är för litet för att betala med kort. Betala hos personalen.'],
    ['payment_unavailable', 503, 'Betalningen fungerar inte just nu (Booqys fel). Betala hos personalen.'],
  ])('explains %s', async (error, status, text) => {
    const user = userEvent.setup()
    payResponse = () => json({ error }, status)
    renderAt('/notan/loc-1', '#L.payload.sig')
    await user.click(await screen.findByRole('button', { name: 'Betala 450 kr' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
  })

  it('says there is nothing to pay on an empty bill', async () => {
    view = () => json(bill({ status: 'empty', amount: 0, count: 0, orders: [], vat: [] }))
    renderAt('/notan/loc-1', '#L.payload.sig')
    expect(await screen.findByText('Det finns inget att betala för bordet just nu.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
  })

  it('asks for a new QR code when the link is gone', async () => {
    view = () => json({ error: 'not found' }, 404)
    renderAt('/notan/loc-1', '#L.old.sig')
    expect(await screen.findByRole('alert')).toHaveTextContent('Länken gäller inte längre. Be personalen om en ny QR-kod för notan.')
  })

  it('asks for a new QR code without any token', () => {
    renderAt('/notan/loc-1')
    expect(screen.getByRole('alert')).toHaveTextContent('Länken gäller inte längre.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('waits for the answer after Swish or the bank and then stamps it paid', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    paidStatuses = [{ billId: BILL_ID, status: 'paying', amount: 45000, orders: [], vat: [] }, paidStatuses[0]]
    renderAt(`/notan/loc-1?nota=${BILL_ID}`, '#bill-tok')
    expect(await screen.findByRole('status', { name: 'Betalningen bekräftas' })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BILL_POLL_MS)
    })
    await waitFor(() => expect(screen.getByText('Betald')).toBeInTheDocument())
    expect(calls((url) => url.includes('/table-bill/pay')).length).toBe(0)
    expect(calls((url) => /\/table-bill$|\/table-bill\?/.test(url)).length).toBe(0)
  })

  it('tells the guest nothing was charged when the payment expired', async () => {
    paidStatuses = [{ billId: BILL_ID, status: 'expired', amount: 45000, orders: [], vat: [] }]
    renderAt(`/notan/loc-1?nota=${BILL_ID}`, '#bill-tok')
    expect(await screen.findByText(/Betalningen gick inte igenom, så inget har dragits/)).toBeInTheDocument()
  })
})
