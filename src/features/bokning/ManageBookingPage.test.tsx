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
})
