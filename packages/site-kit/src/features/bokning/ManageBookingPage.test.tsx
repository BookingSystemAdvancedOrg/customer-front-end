import { leaked, translatableStrings } from '../../test/translatable'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ManageBookingPage from './ManageBookingPage'
import { json, siteConfig } from '../../test/siteData'
import { SiteContext } from '../../shared/SiteContext'

// Stripe.js is never loaded in tests: a fake Payment Element and stripe.confirmSetup.
const confirmSetup = vi.fn()
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(async () => ({})) }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="elements">{children}</div>,
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    onReady?.()
    return <div>Kortformulär</div>
  },
  useStripe: () => ({ confirmSetup }),
  useElements: () => ({}),
}))

const BOOKING = {
  reservationId: 'r1', status: 'reserved', date: '2026-09-20', startTime: '18:00', endTime: '20:00',
  partySize: 2, tableIds: ['t1'], customerName: 'Anna', cancellable: true,
  location: { locationId: 'loc-1', name: 'Testkrogen', address: 'Gatan 1', phoneNumber: '08-1' },
}

it('shows the booking length', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...BOOKING, durationMinutes: 120, extendable: false, ruleName: null })))
  renderAt('#tok')
  expect(await screen.findByText('2 tim, kan inte förlängas')).toBeInTheDocument()
})

it('offers the booking for the calendar while it is active', async () => {
  renderAt('#tok')
  const add = await screen.findByRole('link', { name: 'Lägg till i kalendern' })
  const ics = decodeURIComponent(add.getAttribute('href')!.split(',')[1])
  expect(add).toHaveAttribute('download', 'bokning.ics')
  expect(ics).toContain('UID:r1@booqy.se')
  expect(ics).toContain('SUMMARY:Bord hos Testkrogen')
  expect(ics).toContain('LOCATION:Gatan 1')
  expect(screen.getByRole('link', { name: 'Google Kalender' })).toHaveAttribute(
    'href', expect.stringContaining('https://calendar.google.com/calendar/render?action=TEMPLATE'))
})

it('no calendar button for a cancelled booking', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...BOOKING, status: 'cancelled_no_charge', cancellable: false })))
  renderAt('#tok')
  expect(await screen.findByText('Avbokad')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Lägg till i kalendern' })).not.toBeInTheDocument()
})

function renderAt(hash: string) {
  window.location.hash = hash
  const config = siteConfig()
  config.stripe = { publishableKey: 'pk_test_1', accountId: 'acct_1' }
  return render(
    <SiteContext.Provider value={{ config, location: config.locations[0], setLocationId: () => {} }}>
      <MemoryRouter initialEntries={['/bokning/loc-1/r1']}>
        <Routes>
          <Route path="/bokning/:locationId/:reservationId" element={<ManageBookingPage />} />
        </Routes>
      </MemoryRouter>
    </SiteContext.Provider>,
  )
}

/** Bokad per telefon: väntar på kortet, med kortsteget (setup) i gästvyn. */
const PHONE_PENDING = {
  ...BOOKING, status: 'pending', partySize: 4, cancellable: false,
  guarantee: { cardOnFile: false, noShowFee: 80000, lateCancelFee: 40000, cancelCutoffHours: 24,
    freeCancelUntil: '2026-09-19T16:00:00Z', currency: 'sek', cancellationFee: 0 },
  setup: { clientSecret: 'seti_secret', stripeAccount: 'acct_1',
    expiresAt: new Date(Date.now() + 30 * 60000).toISOString() },
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    if (headers['X-Manage-Token'] !== 'tok') return json({ error: 'not found' }, 404)
    if (url.endsWith('/cancel')) return json({ ...BOOKING, status: 'cancelled_no_charge', cancellable: false })
    return json(BOOKING)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
  window.history.replaceState(null, '', '/')
})

describe('ManageBookingPage', () => {
  it('shows the booking and cancels after confirmation', async () => {
    const user = userEvent.setup()
    renderAt('#tok')
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    expect(screen.getByText('söndag 20 september')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Avboka' }))
    await user.click(screen.getByRole('button', { name: 'Ja, avboka' }))

    expect(await screen.findByText('Avbokad')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Avboka' })).not.toBeInTheDocument()
  })

  it('a wrong token looks like an unknown booking', async () => {
    renderAt('#wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent('hittades inte')
  })

  it('a link without token asks for the confirmation link', () => {
    renderAt('')
    expect(screen.getByRole('alert')).toHaveTextContent('ofullständig')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks the guest to accept a late-cancellation fee before cancelling', async () => {
    const user = userEvent.setup()
    const late = { ...BOOKING, guarantee: { cardOnFile: true, noShowFee: 60000, lateCancelFee: 30000,
      cancelCutoffHours: 24, currency: 'sek', cancellationFee: 30000 } }
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/cancel')) {
        expect(JSON.parse(String(init?.body))).toEqual({ acceptFee: true })
        return json({ ...late, status: 'cancelled_charged', cancellable: false,
          fee: { kind: 'late_cancel', status: 'succeeded', amount: 30000, refundedAmount: 0 } })
      }
      return json(late)
    })
    renderAt('#tok')
    await user.click(await screen.findByRole('button', { name: 'Avboka' }))
    const confirm = screen.getByRole('button', { name: 'Ja, avboka' })
    expect(confirm).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /300 kr/ }))
    await user.click(confirm)
    expect(await screen.findByText('Avbokad - avgift debiterad')).toBeInTheDocument()
    expect(screen.getByText(/Debiterad avgift: 300 kr/)).toBeInTheDocument()
  })

  it('shows the fee checkbox when the fee started after the page loaded', async () => {
    const user = userEvent.setup()
    const guarantee = { cardOnFile: true, noShowFee: 60000, lateCancelFee: 30000, cancelCutoffHours: 24,
      currency: 'sek', cancellationFee: 0 }
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/cancel')) {
        if (!String(init?.body ?? '').includes('acceptFee')) return json({ error: 'fee_applies', fee: 30000 }, 409)
        return json({ ...BOOKING, guarantee, status: 'cancelled_charged', cancellable: false })
      }
      return json({ ...BOOKING, guarantee })
    })
    renderAt('#tok')
    await user.click(await screen.findByRole('button', { name: 'Avboka' }))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ja, avboka' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Godkänn avgiften')
    const fee = screen.getByRole('checkbox', { name: /300 kr/ })
    await waitFor(() => expect(fee).toHaveFocus())
    expect(fee).toHaveAttribute('aria-describedby', alert.id)
    const confirm = screen.getByRole('button', { name: 'Ja, avboka' })
    expect(confirm).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /300 kr/ }))
    await user.click(confirm)
    expect(await screen.findByText('Avbokad - avgift debiterad')).toBeInTheDocument()
  })

  it('an unfinished card step points to a new booking', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/confirm')) return json({ error: 'card_not_confirmed' }, 409)
      return json({ ...BOOKING, status: 'pending', cancellable: false })
    })
    renderAt('#tok')
    expect(await screen.findByText(/Bokningen blev inte klar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gör en ny bokning' })).toHaveAttribute('href', '/boka-bord')
    expect(screen.queryByText(/20 minuter/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Väntar på kortgaranti/)).not.toBeInTheDocument()
  })

  it('finishes a pending booking when the guest comes back from Stripe', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/confirm')) return json({ ...BOOKING, status: 'reserved' })
      return json({ ...BOOKING, status: 'pending' })
    })
    renderAt('#tok')
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
  })
})

describe('ManageBookingPage card step (booked by phone)', () => {
  beforeEach(() => confirmSetup.mockReset())

  function pendingWithCard(confirmed = false) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/confirm')) {
        if (!confirmed) return json({ error: 'card_not_confirmed' }, 409)
        expect((init!.headers as Record<string, string>)['X-Manage-Token']).toBe('tok')
        return json({ ...PHONE_PENDING, status: 'reserved', cancellable: true, setup: undefined,
          guarantee: { ...PHONE_PENDING.guarantee, cardOnFile: true } })
      }
      return json(PHONE_PENDING)
    })
  }

  it('shows the card step with 0 kr now and the fees for the party', async () => {
    pendingWithCard()
    renderAt('#tok')
    expect(await screen.findByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
    expect(screen.getByText('0 kr dras nu.')).toBeInTheDocument()
    expect(screen.getByText('Uteblivet besök: 200 kr/person (800 kr för 4 personer).')).toBeInTheDocument()
    expect(screen.getByText('Avbokning senare än 24 timmar före: 100 kr/person (400 kr för 4 personer).')).toBeInTheDocument()
    expect(screen.getByText('söndag 20 september')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara kortet och boka' })).toBeInTheDocument()
    expect(screen.queryByText(/Bokningen blev inte klar/)).not.toBeInTheDocument()
  })

  it('the hold time comes from setup.expiresAt (30 min for a phone booking)', async () => {
    pendingWithCard()
    renderAt('#tok')
    expect(await screen.findByText(/hålls åt dig i 30 min till/)).toBeInTheDocument()
    expect(screen.queryByText(/20 minuter|20 min/)).not.toBeInTheDocument()
  })

  it('saves the card with this page as return_url, confirms with the token and shows the booking', async () => {
    const user = userEvent.setup()
    pendingWithCard()
    confirmSetup.mockImplementation(async () => {
      pendingWithCard(true)
      return { setupIntent: { status: 'succeeded' } }
    })
    renderAt('#tok')
    await user.click(await screen.findByRole('button', { name: 'Spara kortet och boka' }))
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    expect(screen.getByText(/Kortgarantin är sparad/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kortgaranti' })).not.toBeInTheDocument()
    expect(confirmSetup).toHaveBeenCalledWith(expect.objectContaining({
      confirmParams: { return_url: `${window.location.origin}/bokning/loc-1/r1#tok` },
    }))
  })

  it('back from Stripe: finishes the booking and shows the saved card', async () => {
    pendingWithCard(true)
    renderAt('#tok')
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    expect(screen.getByText(/Kortgarantin är sparad/)).toBeInTheDocument()
  })

  it('no card step for a reserved booking', async () => {
    fetchMock.mockImplementation(async () => json({ ...PHONE_PENDING, status: 'reserved', cancellable: true }))
    renderAt('#tok')
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kortgaranti' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Spara kortet och boka' })).not.toBeInTheDocument()
  })

  it('back from a failed 3-D Secure: the card form again with the bank error, Stripe params removed', async () => {
    pendingWithCard()
    window.history.replaceState(null, '',
      '/bokning/loc-1/r1?setup_intent=seti_1&setup_intent_client_secret=seti_secret&redirect_status=failed')
    renderAt('#tok')
    expect(await screen.findByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Kortet kunde inte verifieras av banken. Försök igen eller använd ett annat kort.')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#tok')
  })

  it('back from a succeeded redirect: no error, Stripe params removed', async () => {
    pendingWithCard(true)
    window.history.replaceState(null, '',
      '/bokning/loc-1/r1?setup_intent=seti_1&setup_intent_client_secret=seti_secret&redirect_status=succeeded')
    renderAt('#tok')
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('card form not available right now while the table is held: try again, never "make a new booking"', async () => {
    const user = userEvent.setup()
    const until = new Date(Date.now() + 20 * 60000).toISOString()
    let available = false
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/confirm')) return json({ error: 'card_not_confirmed' }, 409)
      return json(available ? PHONE_PENDING
        : { ...PHONE_PENDING, setup: undefined, setupUnavailable: true, pendingExpiresAt: until })
    })
    renderAt('#tok')
    expect(await screen.findByText(/Kortformuläret kunde inte hämtas just nu/)).toBeInTheDocument()
    const clock = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit',
      minute: '2-digit', hourCycle: 'h23' }).format(new Date(until))
    expect(screen.getByText(new RegExp(`Bordet hålls åt dig till kl ${clock}`))).toBeInTheDocument()
    expect(screen.getByText('Väntar på kortet')).toBeInTheDocument()
    expect(screen.queryByText(/Bokningen blev inte klar/)).not.toBeInTheDocument()
    available = true
    await user.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
  })

  it('setupUnavailable after the hold ran out: the booking was not completed', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/confirm')) return json({ error: 'card_not_confirmed' }, 409)
      return json({ ...PHONE_PENDING, setup: undefined, setupUnavailable: true,
        pendingExpiresAt: new Date(Date.now() - 60000).toISOString() })
    })
    renderAt('#tok')
    expect(await screen.findByText(/Bokningen blev inte klar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Försök igen' })).not.toBeInTheDocument()
  })

  it('no card step for a pending booking without setup', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/confirm')) return json({ error: 'card_not_confirmed' }, 409)
      return json({ ...PHONE_PENDING, setup: undefined })
    })
    renderAt('#tok')
    expect(await screen.findByText(/Bokningen blev inte klar/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kortgaranti' })).not.toBeInTheDocument()
  })
})

it('never sends the guest\'s name or the address to the page translator', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...BOOKING, customerName: 'Anna Gästsson', durationMinutes: 120, extendable: false, ruleName: null })))
  renderAt('#tok')
  expect(await screen.findByText('Anna Gästsson')).toBeInTheDocument()
  const sent = await translatableStrings()
  expect(sent.length).toBeGreaterThan(0)
  expect(leaked(sent, ['Anna Gästsson', 'Gatan 1'])).toEqual([])
})
