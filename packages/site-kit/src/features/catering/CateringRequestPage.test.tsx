import { leaked, translatableStrings } from '../../test/translatable'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CateringRequestPage, { RETURN_CHECK_MS, RETURN_CHECKS } from './CateringRequestPage'
import type { GuestRequest } from './cateringApi'
import { ApiError } from '../../shared/api'
import { SiteContext } from '../../shared/SiteContext'
import { siteConfig } from '../../test/siteData'

const api = vi.hoisted(() => ({ getRequest: vi.fn(), signingStatus: vi.fn(), startSigning: vi.fn() }))
vi.mock('./cateringApi', async (orig) => {
  const real = await orig<typeof import('./cateringApi')>()
  return Object.fromEntries(Object.entries(real).map(([k, v]) =>
    [k, k in api ? (...a: unknown[]) => (api as Record<string, (...x: unknown[]) => unknown>)[k](...a) : v]))
})
vi.mock('qrcode', () => ({ default: { toDataURL: (d: string) => Promise.resolve(`data:qr,${d}`) } }))

const TOTALS = { subtotal: 150000, discountPercent: 0, discount: 0, deliveryFee: 0, total: 150000, vat: 16071 }
function guest(extra: Partial<GuestRequest> = {}): GuestRequest {
  return {
    requestId: 'req-1', locationId: 'loc-1', status: 'offer_sent', customerType: 'private', customerName: 'Anna Andersson',
    deliveryDate: '2026-11-20', deliveryTime: '12:00', fulfilment: 'pickup',
    request: { lines: [{ name: 'Lasagne', unitPrice: 5000, quantity: 30 }], portions: 30, ...TOTALS },
    offer: { version: 1, lines: [{ name: 'Lasagne', unitPrice: 5000, quantity: 30 }], totals: TOTALS, validUntil: '2026-11-01',
      message: 'Välkommen!', terms: 'Villkor', documentHash: 'f'.repeat(64) },
    canSign: true, canPay: false, ...extra,
  }
}

function renderGuest(hash = '#t=tok-1') {
  const config = siteConfig()
  return render(
    <MemoryRouter initialEntries={[`/catering/loc-1/req-1${hash}`]}>
      <SiteContext.Provider value={{ config, location: config.locations[0], setLocationId: () => {} }}>
        <Routes>
          <Route path="catering/:locationId/:requestId" element={<CateringRequestPage />} />
        </Routes>
      </SiteContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CateringRequestPage retries in place', () => {
  it('shows the printing loader, and a failed load retries with Försök igen', async () => {
    const user = userEvent.setup()
    api.getRequest.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(guest())
    renderGuest()
    expect(screen.getByRole('status')).toHaveTextContent('Hämtar förfrågan')
    await user.click(await screen.findByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByText('Din offert är klar')).toBeInTheDocument()
    expect(api.getRequest).toHaveBeenCalledTimes(2)
  })

  it('back from signing while still pending: no reload prompt, Försök igen checks again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.getRequest.mockResolvedValue(guest())
      api.signingStatus.mockResolvedValue({ status: 'pending' })
      renderGuest('?signering=klar#t=tok-1')
      expect(await screen.findByText(/Kontrollerar signeringen/)).toBeInTheDocument()
      for (let i = 1; i < RETURN_CHECKS; i++) await act(async () => { vi.advanceTimersByTime(RETURN_CHECK_MS) })
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Signeringen är inte klar än.')
      expect(alert).not.toHaveTextContent(/ladda om/i)
      expect(api.signingStatus).toHaveBeenCalledTimes(RETURN_CHECKS)
      api.signingStatus.mockResolvedValueOnce({ status: 'complete', request: guest({ status: 'signed', canSign: false, signedBy: 'Anna Andersson' }) })
      act(() => { screen.getByRole('button', { name: 'Försök igen' }).click() })
      expect(await screen.findByText('Offerten är signerad')).toBeInTheDocument()
      await waitFor(() => expect(api.signingStatus).toHaveBeenCalledTimes(RETURN_CHECKS + 1))
    } finally {
      vi.useRealTimers()
    }
  })

  it('a new action after a pending return clears the pending retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.getRequest.mockResolvedValue(guest())
      api.signingStatus.mockResolvedValue({ status: 'pending' })
      renderGuest('?signering=klar#t=tok-1')
      expect(await screen.findByText(/Kontrollerar signeringen/)).toBeInTheDocument()
      for (let i = 1; i < RETURN_CHECKS; i++) await act(async () => { vi.advanceTimersByTime(RETURN_CHECK_MS) })
      expect(await screen.findByRole('alert')).toHaveTextContent('Signeringen är inte klar än.')
      api.startSigning.mockRejectedValueOnce(new ApiError(500, 'boom'))
      act(() => { screen.getByRole('button', { name: 'Signera med BankID' }).click() })
      await waitFor(() => expect(api.startSigning).toHaveBeenCalledTimes(1))
      expect(await screen.findByRole('alert')).not.toHaveTextContent('Signeringen är inte klar än.')
      expect(screen.queryByRole('button', { name: 'Försök igen' })).not.toBeInTheDocument()
      expect(api.signingStatus).toHaveBeenCalledTimes(RETURN_CHECKS)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('CateringRequestPage and the page translator', () => {
  it('never sends the customer, the company or the offer message', async () => {
    api.getRequest.mockResolvedValue(guest({ customerType: 'company', companyName: 'Gästbolaget AB', customerName: 'Anna Gästsson' } as Partial<GuestRequest>))
    renderGuest()
    expect(await screen.findByText('Din offert är klar')).toBeInTheDocument()
    const sent = await translatableStrings()
    expect(sent.length).toBeGreaterThan(0)
    expect(leaked(sent, ['Anna Gästsson', 'Gästbolaget AB', 'Välkommen!', 'Lasagne'])).toEqual([])
  })
  it('never sends the first name while the request waits for an offer', async () => {
    api.getRequest.mockResolvedValue(guest({ status: 'requested', customerName: 'Örjan Gästsson' } as Partial<GuestRequest>))
    renderGuest()
    expect(await screen.findByText(/skickar en offert till/)).toBeInTheDocument()
    const sent = await translatableStrings()
    expect(sent.length).toBeGreaterThan(0)
    expect(leaked(sent, ['Örjan'])).toEqual([])
  })
})

describe('CateringRequestPage after payment', () => {
  it('a paid private request shows how it was paid, and no longer asks for payment', async () => {
    api.getRequest.mockResolvedValue(guest({ status: 'confirmed', canSign: false, paid: true, paidWith: { method: 'klarna' } }))
    renderGuest()
    expect(await screen.findByText('Din catering är bekräftad')).toBeInTheDocument()
    expect(screen.getByText(/Betald med/)).toHaveTextContent('Betald med Klarna')
    expect(screen.getByText('Klarna')).toHaveAttribute('translate', 'no')
    expect(screen.queryByText(/Betalas här på sidan/)).toBeNull()
  })

  it('back from Swish or Klarna before the webhook: processing, never Betalt', async () => {
    api.getRequest.mockResolvedValue(guest({ status: 'signed', canSign: false, canPay: true }))
    renderGuest('?betalning=klar#t=tok-1')
    expect(await screen.findByText('Betalningen behandlas')).toBeInTheDocument()
    expect(screen.queryByText('Betalt')).toBeNull()
  })

  it('an unpaid private offer says it is paid on the page after signing', async () => {
    api.getRequest.mockResolvedValue(guest())
    renderGuest()
    expect(await screen.findByText(/Betalas här på sidan direkt efter signering/)).toBeInTheDocument()
    expect(screen.queryByText(/Betald med/)).toBeNull()
  })
})
