import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WithSite } from '../../test/siteFixture'
import { siteConfig } from '../../test/siteData'
import KoPage from './KoPage'
import * as api from './koApi'
import { ApiError } from '../../shared/api'

vi.mock('./koApi', async (orig) => ({
  ...(await orig<typeof import('./koApi')>()),
  joinQueue: vi.fn(), queueStatus: vi.fn(), acceptTable: vi.fn(), leaveQueue: vi.fn(),
}))

const FEATURES = { reservations: true, ordering: true, catering: false, terminal: false, waitlist: true }

function page(publicJoin = true, features: Record<string, boolean> = FEATURES) {
  const config = siteConfig({ features })
  config.locations[0].waitlist = { publicJoin }
  return render(<WithSite config={config}><KoPage /></WithSite>)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.location.hash = ''
})

describe('KoPage', () => {
  it('says there is no queue when public join is off', () => {
    page(false)
    expect(screen.getByText(/har ingen kö via hemsidan/)).toBeInTheDocument()
  })

  it('joins, keeps the token for the day and shows the position', async () => {
    vi.mocked(api.joinQueue).mockResolvedValue({ token: 'tok.mac', position: 3 })
    vi.mocked(api.queueStatus).mockResolvedValue({ status: 'waiting', position: 3, locationName: 'Bistro' })
    page()
    fireEvent.change(screen.getByLabelText('Namn'), { target: { value: 'Sara' } })
    fireEvent.change(screen.getByLabelText('Mobilnummer'), { target: { value: '0701234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ställ mig i kö' }))
    await waitFor(() => expect(api.joinQueue).toHaveBeenCalled())
    const [, body] = vi.mocked(api.joinQueue).mock.calls[0]
    expect(body).toMatchObject({ name: 'Sara', partySize: 2, phone: '+46701234567' })
    expect(await screen.findByText(/Du är nummer/)).toBeInTheDocument()
    expect(window.localStorage.getItem('booqy-waitlist-loc-1')).toContain('tok.mac')
  })

  it('names the party size dropdown and its list by the label alone', () => {
    page()
    const box = screen.getByRole('combobox', { name: 'Antal personer' })
    fireEvent.click(box)
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-label', 'Antal personer')
  })

  it('takes the offered table from the SMS link', async () => {
    window.location.hash = '#tok.mac'
    vi.mocked(api.queueStatus).mockResolvedValue({
      status: 'offered', position: null, locationName: 'Bistro', offer: { startTime: '19:00', expiresAt: '2026-11-04T17:10:00Z' },
    })
    vi.mocked(api.acceptTable).mockResolvedValue({ reservationId: 'r1', manageToken: 'm' })
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Ta bordet' }))
    await waitFor(() => expect(api.acceptTable).toHaveBeenCalledWith('tok.mac'))
    expect(await screen.findByText('Bordet är ditt. Välkommen in!')).toBeInTheDocument()
  })

  it('shows the expired text when the hold ran out', async () => {
    window.location.hash = '#tok.mac'
    vi.mocked(api.queueStatus).mockResolvedValue({ status: 'expired', position: null, locationName: 'Bistro' })
    page()
    expect(await screen.findByText(/Tiden för bordet gick ut/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lämna kön' })).toBeNull()
  })

  it('prints a receipt, not the join form, while the queue link loads', () => {
    window.location.hash = '#tok.mac'
    vi.mocked(api.queueStatus).mockReturnValue(new Promise(() => {}))
    page()
    expect(screen.getByRole('status')).toHaveTextContent('Hämtar din plats i kön')
    expect(screen.queryByRole('button', { name: 'Ställ mig i kö' })).toBeNull()
  })

  it('offers a retry instead of the join form when the status fails to load', async () => {
    window.location.hash = '#tok.mac'
    vi.mocked(api.queueStatus)
      .mockRejectedValueOnce(new ApiError(503, 'unavailable', { error: 'unavailable' }))
      .mockResolvedValueOnce({ status: 'waiting', position: 2, locationName: 'Bistro' })
    page()
    expect(await screen.findByText(/Vi kunde inte hämta din plats i kön/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ställ mig i kö' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByText(/Du är nummer/)).toBeInTheDocument()
  })

  it('shows the join form again when the queue entry is gone (404)', async () => {
    window.location.hash = '#tok.mac'
    vi.mocked(api.queueStatus).mockRejectedValue(new ApiError(404, 'not_found', { error: 'not_found' }))
    page()
    expect(await screen.findByRole('button', { name: 'Ställ mig i kö' })).toBeInTheDocument()
  })
})
