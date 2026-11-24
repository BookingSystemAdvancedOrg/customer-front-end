import { act, render, screen } from '@testing-library/react'
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

  it('shows where the food goes: the table for a QR order, Avhämtning for pickup', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ status: 'preparing', mode: 'table', tableLabel: '3' })]
    const first = renderAt()
    expect(await screen.findByText('Bord 3')).toHaveClass('order-place')
    expect(screen.queryByText('Avhämtning')).toBeNull()
    first.unmount()
    statuses = [order({ status: 'preparing', mode: 'table', tableLabel: 'Terrassen' })]
    const named = renderAt()
    expect(await screen.findByText('Terrassen')).toHaveClass('order-place')
    named.unmount()
    statuses = [order({ status: 'preparing' })]
    renderAt()
    expect(await screen.findByText('Avhämtning')).toHaveClass('order-place')
  })

  it('names the table in the sentences: "bord 3", an own name as is, else "ditt bord"', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    const cases: [string | undefined, string][] = [['3', 'bord 3'], ['Bar', 'Bar'], ['Bord 7', 'Bord 7'], [undefined, 'ditt bord']]
    for (const [tableLabel, table] of cases) {
      statuses = [order({ status: 'confirmed', mode: 'table', ...(tableLabel ? { tableLabel } : {}) })]
      const view = renderAt()
      expect(await screen.findByText(`Tack! Vi serverar vid ${table}.`)).toBeInTheDocument()
      expect(screen.getByText(`Köket har fått beställningen. Vi sms:ar när maten lagas och kommer till ${table}.`)).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/bord Bar|bord bord/i)
      view.unmount()
    }
  })

  it('tells the guest a failed payment cost nothing', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ status: 'failed' })]
    renderAt()
    expect(await screen.findByText('Betalningen gick inte igenom.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Försök igen' })).toHaveAttribute('href', '/bestall')
  })

  it('shows how the guest paid under the total, the brand left to the translator alone', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ paymentStatus: 'paid', paidWith: { method: 'card', brand: 'visa', last4: '4242' } })]
    const card = renderAt()
    const line = await screen.findByText(/Betald med/)
    expect(line).toHaveTextContent('Betald med Visa ****4242')
    expect(line).toHaveClass('paid-with')
    expect(screen.getByText('Visa ****4242')).toHaveAttribute('translate', 'no')
    card.unmount()
    statuses = [order({ status: 'ready', paymentStatus: 'paid', paidWith: { method: 'swish' } })]
    const swish = renderAt()
    expect(await screen.findByText(/Betald med/)).toHaveTextContent('Betald med Swish')
    swish.unmount()
    statuses = [order({ paymentStatus: 'paid', paidWith: { method: 'apple_pay', brand: 'visa', last4: '4242' } })]
    const wallet = renderAt()
    expect(await screen.findByText(/Betald med/)).toHaveTextContent('Betald med Apple Pay')
    wallet.unmount()
    statuses = [order({ paymentStatus: 'paid' })]
    renderAt()
    expect(await screen.findByText('Tack! Beställningen är mottagen.')).toBeInTheDocument()
    expect(screen.queryByText(/Betald med/)).toBeNull()
  })

  it('while the payment is pending: a hint true for every method and no paid line', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ status: 'pending_payment', number: undefined, paymentStatus: 'processing', paidWith: { method: 'klarna' } })]
    renderAt()
    expect(await screen.findByText('Väntar på betalningen…')).toBeInTheDocument()
    expect(screen.getByText('Oftast några sekunder, ibland längre. Sidan uppdateras av sig själv.')).toBeInTheDocument()
    expect(screen.queryByText(/Betald med/)).toBeNull()
  })

  it('a cancelled order: the refund goes back the way it was paid', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ status: 'cancelled', paymentStatus: 'refunded', paidWith: { method: 'card', brand: 'visa', last4: '4242' } })]
    const card = renderAt()
    expect(await screen.findByText(/betalas tillbaka/)).toHaveTextContent(
      'Hela beloppet, 250 kr, betalas tillbaka till ditt kort inom några bankdagar.',
    )
    card.unmount()
    statuses = [order({ status: 'cancelled', paymentStatus: 'refunded', paidWith: { method: 'swish' } })]
    renderAt()
    expect(await screen.findByText(/betalas tillbaka/)).toHaveTextContent(
      'Hela beloppet, 250 kr, betalas tillbaka via Swish, oftast inom några minuter.',
    )
  })

  it('a refund that came back: the restaurant pays back another way, no method promise', async () => {
    sessionStorage.setItem(`order-token:${ID}`, 'tok')
    statuses = [order({ status: 'cancelled', paymentStatus: 'refunded', paidWith: { method: 'swish' }, refundIssue: true })]
    renderAt()
    expect(await screen.findByText(/Återbetalningen gick inte fram/)).toHaveTextContent(
      'Återbetalningen gick inte fram. Restaurangen betalar tillbaka på annat sätt och hör av sig.',
    )
    expect(screen.queryByText(/via Swish/)).toBeNull()
  })

  it('without any token it asks for the link', () => {
    renderAt()
    expect(screen.getByRole('alert')).toHaveTextContent('Länken är ofullständig')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
