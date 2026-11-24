import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BokaBordPage from './BokaBordPage'
import { WithSite } from '../../test/siteFixture'
import { guestView, json, partyOf, siteConfig } from '../../test/siteData'
import { pickOption } from '../../test/select'

// Stripe.js is never loaded in tests: a fake Payment Element and stripe.confirmSetup.
const confirmSetup = vi.fn()
const paymentElementOptions = vi.fn()
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(async () => ({})) }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="elements">{children}</div>,
  PaymentElement: ({ onReady, options }: { onReady?: () => void; options?: unknown }) => {
    paymentElementOptions(options)
    onReady?.()
    return <div>Kortformulär</div>
  },
  useStripe: () => ({ confirmSetup }),
  useElements: () => ({}),
}))

const LAYOUT = {
  floors: [],
  elements: [
    { elementId: 'table-b', type: 'table', x: 3, y: 0, z: 1, width: 1, height: 0.75, depth: 1, rotationY: 0, shape: 'rect', seats: 4, zone: 'main' },
  ],
}
const PENDING = {
  reservationId: 'r1', status: 'pending', date: '2026-09-20', startTime: '18:00', endTime: '20:00',
  partySize: 3, tableIds: ['table-b'], customerName: 'Anna', cancellable: true, manageToken: 'tok',
  guarantee: { cardOnFile: false, noShowFee: 60000, lateCancelFee: 30000, cancelCutoffHours: 24,
    freeCancelUntil: '2026-09-19T16:00:00Z', currency: 'sek', cancellationFee: 0 },
  setup: { clientSecret: 'seti_secret', stripeAccount: 'acct_1', expiresAt: new Date(Date.now() + 20 * 60000).toISOString() },
}

function config() {
  const c = siteConfig()
  c.stripe = { publishableKey: 'pk_test_1', accountId: 'acct_1' }
  c.locations[0].guarantee = { minPartySize: 3, noShowFeePerPerson: 200, lateCancelFeePerPerson: 100, cancelCutoffHours: 24 }
  return c
}

let fetchMock: ReturnType<typeof vi.fn>
// Per test: the table, the active layout, the slot's own table entry and the
// names the server stamped on the hold and the booking.
let tableId: string
let layoutResponse: () => Response
let slotTable: { tableId: string; seats: number; label?: string }
let stamped: Record<string, unknown>
beforeEach(() => {
  confirmSetup.mockReset()
  paymentElementOptions.mockReset()
  tableId = 'table-b'
  layoutResponse = () => json(LAYOUT)
  slotTable = { tableId: 'table-b', seats: 4 }
  stamped = {}
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/availability')) {
      return json(guestView({ locationId: 'loc-1', date: 'x', timezone: 'Europe/Stockholm',
        slots: [{ startTime: '18:00', endTime: '20:00', layoutVersion: 1, tables: [slotTable] }] },
      partyOf(url)))
    }
    if (url.includes('/layout/active')) return layoutResponse()
    if (url.endsWith('/reservations') && init?.method === 'POST') return json({ ...PENDING, tableIds: [tableId], ...stamped }, 201)
    if (url.endsWith('/holds') && init?.method === 'POST') {
      return json({ holdId: 'r1', manageToken: 'tok', expiresAt: PENDING.setup.expiresAt, holdMinutes: 15,
        date: '2026-09-20', startTime: '18:00', endTime: '20:00', tableIds: [tableId], partySize: 3,
        cardRequired: true, ...stamped }, 201)
    }
    if (url.includes('/holds/') && init?.method === 'DELETE') return json({ released: true })
    if (url.endsWith('/confirm')) {
      return json({ ...PENDING, tableIds: [tableId], ...stamped, status: 'reserved', setup: undefined, manageToken: undefined,
        guarantee: { ...PENDING.guarantee, cardOnFile: true } })
    }
    return json({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function bookThree(user: ReturnType<typeof userEvent.setup>, chip: RegExp = /Bord 1 · 4 platser/) {
  render(<WithSite config={config()}><BokaBordPage /></WithSite>)
  await pickOption(user, screen.getByLabelText('Antal personer'), '3 personer')
  await user.click(await screen.findByRole('button', { name: '18:00' }))
  await user.click(await screen.findByRole('button', { name: chip }))
  await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
  await user.type(await screen.findByLabelText('Namn'), 'Anna')
  await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
  await user.type(screen.getByLabelText('Telefon'), '0701234567')
  expect(screen.getByRole('checkbox', { name: /bokningsvillkoren/ })).not.toBeChecked()
  await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
}

describe('card guarantee', () => {
  it('shows the terms before booking, then the card form, then the confirmation', async () => {
    const user = userEvent.setup()
    confirmSetup.mockResolvedValue({ setupIntent: { status: 'succeeded' } })
    await bookThree(user)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Kortgaranti krävs för sällskap om 3 personer eller fler. 0 kr dras nu.')
    expect(note).toHaveTextContent('Uteblivet besök: 200 kr/person (600 kr för 3 personer).')
    expect(note).toHaveTextContent('Avbokning senare än 24 timmar före: 100 kr/person (300 kr för 3 personer).')
    expect(note).toHaveTextContent('Restaurangen kan efterskänka avgiften vid sjukdom eller liknande.')
    expect(screen.getByRole('checkbox', { name: /bokningsvillkoren/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Fortsätt till kortgaranti' }))

    expect(await screen.findByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
    expect(screen.getByText('Uteblivet besök: 200 kr/person (600 kr för 3 personer).')).toBeInTheDocument()
    expect(screen.getByText('Kostnadsfri avbokning senast lördag 19 september kl 18:00.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Spara kortet och boka' }))

    expect(await screen.findByRole('heading', { name: 'Ditt bord är bokat' })).toBeInTheDocument()
    expect(screen.getByText(/Kortgarantin är sparad/)).toBeInTheDocument()
    expect(screen.getByText('Avbokning senare än 24 timmar före: 100 kr/person (300 kr för 3 personer).')).toBeInTheDocument()
    expect(screen.getByText('Kostnadsfri avbokning senast lördag 19 september kl 18:00.')).toBeInTheDocument()
    expect(confirmSetup).toHaveBeenCalledWith(expect.objectContaining({ redirect: 'if_required' }))
    const confirmCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/confirm'))!
    expect((confirmCall[1].headers as Record<string, string>)['X-Manage-Token']).toBe('tok')
    expect(screen.getByRole('link', { name: /\/bokning\/loc-1\/r1#tok$/ })).toBeInTheDocument()
  })

  it('keeps Apple Pay and Google Pay on, turns Stripe Link off and gives Stripe the booking\'s name, email and phone', async () => {
    const user = userEvent.setup()
    await bookThree(user)
    await user.click(screen.getByRole('button', { name: 'Fortsätt till kortgaranti' }))
    await screen.findByRole('button', { name: 'Spara kortet och boka' })

    expect(paymentElementOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' },
      defaultValues: { billingDetails: { name: 'Anna', email: 'anna@example.se', phone: '+46701234567' } },
    }))
  })

  it('keeps the guest on the card step when Stripe declines', async () => {
    const user = userEvent.setup()
    confirmSetup.mockResolvedValue({ error: { message: 'Kortet nekades.' } })
    await bookThree(user)
    await user.click(screen.getByRole('button', { name: 'Fortsätt till kortgaranti' }))
    await user.click(await screen.findByRole('button', { name: 'Spara kortet och boka' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Kortet nekades.')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false)
  })

  it('a small party books without a card', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config()}><BokaBordPage /></WithSite>)
    await pickOption(user, screen.getByLabelText('Antal personer'), '2 personer')
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    await user.click(screen.getByRole('button', { name: /Bord 1 · 4 platser/ }))
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    expect(await screen.findByRole('button', { name: 'Boka bordet' })).toBeInTheDocument()
    expect(screen.queryByRole('note')).toBeNull()
  })

  describe('names the table, never its id', () => {
    const ID = '8ed5290e-8b84-49cc-ac46-dc5438db5181'
    const noId = () => {
      expect(document.body.textContent ?? '').not.toContain(ID)
      expect(document.body.textContent ?? '').not.toContain(ID.slice(0, 6))
      for (const el of document.querySelectorAll('[aria-label], [title]')) {
        expect(el.getAttribute('aria-label') ?? '').not.toContain(ID)
        expect(el.getAttribute('title') ?? '').not.toContain(ID)
      }
    }
    const throughTheCard = async (user: ReturnType<typeof userEvent.setup>) => {
      await bookThree(user, /^Bord 5 · 4 platser/)
      await user.click(screen.getByRole('button', { name: 'Fortsätt till kortgaranti' }))
      expect(await screen.findByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
      expect(screen.getByRole('timer')).toHaveTextContent('Bord 5 hålls åt dig:')
      noId()
      await user.click(screen.getByRole('button', { name: 'Spara kortet och boka' }))
      expect(await screen.findByRole('heading', { name: 'Ditt bord är bokat' })).toBeInTheDocument()
      expect(screen.getByText('Bord', { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^5$/)
      noId()
    }
    beforeEach(() => {
      confirmSetup.mockResolvedValue({ setupIntent: { status: 'succeeded' } })
      tableId = ID
      slotTable = { tableId: ID, seats: 4, label: '5' }
      stamped = { tableLabels: ['5'] }
    })

    it('without the layout: the availability label, then the stamped tableLabels', async () => {
      layoutResponse = () => json({ error: 'boom' }, 500)
      await throughTheCard(userEvent.setup())
    })

    it("after a layout cutover: the slot's own number, not today's layout", async () => {
      // Today's layout draws this table as 1; the booked slot's version numbers it 5.
      layoutResponse = () => json({ floors: [], elements: [{ ...LAYOUT.elements[0], elementId: ID }] })
      await throughTheCard(userEvent.setup())
      expect(screen.queryByText(/Bord 1\b/)).toBeNull()
    })
  })
})
