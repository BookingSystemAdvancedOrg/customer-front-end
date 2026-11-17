import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OrderStatusPage, { STATUS_POLL_MS } from './OrderStatusPage'
import { json } from '../../test/siteData'

const ID = 'o'.repeat(32)
let fetchMock: ReturnType<typeof vi.fn>
let statuses: Record<string, unknown>[]

function order(extra: Record<string, unknown> = {}) {
  return {
    orderId: ID, locationId: 'loc-1', number: 12, status: 'confirmed', mode: 'pickup',
    lines: [{ menuItemId: 'pizza', name: 'Margherita', unitPrice: 12500, quantity: 2, total: 25000, vatRate: 6 }],
    totalAmount: 25000, readyEstimate: '2026-10-12T16:40:00Z',
    location: { name: 'City', address: 'Gatan 1', phoneNumber: '08-1' }, ...extra,
  }
}

function renderAt(hash = '') {
  window.history.replaceState(null, '', `/bestallning/loc-1/${ID}${hash}`)
  return render(
    <MemoryRouter initialEntries={[`/bestallning/loc-1/${ID}`]}>
      <Routes>
        <Route path="bestallning/:locationId/:orderId" element={<OrderStatusPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  statuses = [order()]
  fetchMock = vi.fn(async () => json(statuses.length > 1 ? statuses.shift() : statuses[0]))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('OrderStatusPage', () => {
  it('reads the order with the token from the SMS link', async () => {
    renderAt('#tok-from-sms')
    expect(await screen.findByRole('heading', { name: 'Beställning #12' })).toBeInTheDocument()
    expect(screen.getByText('#12')).toHaveClass('order-code')
    expect(screen.getByText('Tack! Beställningen är mottagen.')).toBeInTheDocument()
    expect(screen.getByText(/Beräknat klar ca/)).toHaveTextContent('18:40')
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({ 'X-Order-Token': 'tok-from-sms' })
  })

  it('uses the token kept in the tab after Stripe and follows the order until it is ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sessionStorage.setItem(`order-token:${ID}`, 'tok-tab')
    statuses = [order({ status: 'pending_payment', number: undefined }), order({ status: 'ready' })]
    renderAt()
    expect(await screen.findByText('Väntar på betalningen…')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STATUS_POLL_MS)
    })
    expect(await screen.findByText('Klar att hämta!')).toBeInTheDocument()
    expect(screen.getByText(/Hämta hos City - Gatan 1/)).toBeInTheDocument()
  })

  it('tells the guest a failed payment cost nothing', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ status: 'failed' })]
    renderAt()
    expect(await screen.findByText('Betalningen gick inte igenom.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Försök igen' })).toHaveAttribute('href', '/bestall')
  })

  it('without any token it asks for the link', () => {
    renderAt()
    expect(screen.getByRole('alert')).toHaveTextContent('Länken är ofullständig')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the table bill with Betala notan and Beställ mer for a pay-later order', async () => {
    statuses = [order({ mode: 'table', tableLabel: '7', payLater: true, paymentStatus: 'unpaid',
      bill: { amount: 45000, count: 3, status: 'open' } })]
    sessionStorage.setItem('order-table-code', 'qr-7')
    renderAt('#tok-sms')
    expect(await screen.findByText('Tack! Vi serverar vid bord 7.')).toBeInTheDocument()
    expect(screen.getByText('Köket har fått beställningen. Du betalar innan du går.')).toBeInTheDocument()
    const rail = screen.getByRole('list', { name: /^Beställning: steg/ })
    expect(within(rail).getByText('Mottagen')).toBeInTheDocument()
    expect(within(rail).queryByText('Betald')).not.toBeInTheDocument()
    expect(within(rail).getByText('Serverad')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Notan för bord 7' })).toBeInTheDocument()
    expect(screen.getByText('Att betala').nextSibling).toHaveTextContent('450 kr')
    expect(screen.getByRole('link', { name: 'Betala notan' })).toHaveAttribute('href', `/notan/loc-1/${ID}`)
    expect(screen.getByRole('link', { name: 'Beställ mer' })).toHaveAttribute('href', '/bestall')
    // Betala notan hittar nyckeln i fliken.
    expect(sessionStorage.getItem(`order-token:${ID}`)).toBe('tok-sms')
  })

  it('sends a guest without the table in this tab back to the QR code, not to pickup', async () => {
    // Statuslänken öppnad i en ny flik (mejlet): bordets kod finns inte, så /bestall vore avhämtning.
    statuses = [order({ mode: 'table', tableLabel: '7', payLater: true, paymentStatus: 'unpaid',
      bill: { amount: 45000, count: 3, status: 'open' } })]
    renderAt('#tok-mail')
    expect(await screen.findByRole('link', { name: 'Betala notan' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Beställ mer' })).not.toBeInTheDocument()
    expect(screen.getByText('Vill du beställa mer? Skanna QR-koden på bordet.')).toBeInTheDocument()
  })

  it('keeps the next round in the cart when a pay-later order is paid', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    sessionStorage.setItem('order-cart:loc-1', JSON.stringify({ pizza: 1 }))
    statuses = [order({ mode: 'table', tableLabel: '7', payLater: true, paymentStatus: 'paid', status: 'completed' })]
    renderAt()
    expect(await screen.findByText('Betald')).toHaveClass('stamp-ok')
    expect(screen.queryByRole('link', { name: 'Betala notan' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('order-cart:loc-1')).not.toBeNull()
  })

  it('shows Betald for a bill paid outside Booqy', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ mode: 'table', tableLabel: '7', payLater: true, paymentStatus: 'paid_outside', paidOutside: true })]
    renderAt()
    expect(await screen.findByText('Betald')).toBeInTheDocument()
  })

  it('says nothing was paid when the restaurant cancels an unpaid table order', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ mode: 'table', tableLabel: '7', payLater: true, paymentStatus: 'void', status: 'cancelled' })]
    renderAt()
    expect(await screen.findByText('Du har inte betalat något för den.')).toBeInTheDocument()
    expect(screen.queryByText(/betalas tillbaka/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Betala notan' })).not.toBeInTheDocument()
  })

  it('keeps the pickup steps and refund text', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ status: 'cancelled', paymentStatus: 'refunded' })]
    renderAt()
    expect(await screen.findByText(/Hela beloppet, 250 kr, betalas tillbaka/)).toBeInTheDocument()
  })
})
