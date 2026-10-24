import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ManageBookingPage from './ManageBookingPage'
import { json } from '../../test/siteData'

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
  return render(
    <MemoryRouter initialEntries={['/bokning/loc-1/r1']}>
      <Routes>
        <Route path="/bokning/:locationId/:reservationId" element={<ManageBookingPage />} />
      </Routes>
    </MemoryRouter>,
  )
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

  it('finishes a pending booking when the guest comes back from Stripe', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/confirm')) return json({ ...BOOKING, status: 'reserved' })
      return json({ ...BOOKING, status: 'pending' })
    })
    renderAt('#tok')
    expect(await screen.findByText('Bokad')).toBeInTheDocument()
  })
})

