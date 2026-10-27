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
})
