import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WithSite } from '../../test/siteFixture'
import { siteConfig } from '../../test/siteData'
import GiftCardField from './GiftCardField'
import PresentkortPage from './PresentkortPage'
import SaldoPage from './SaldoPage'
import * as api from './giftApi'

vi.mock('./giftApi', async (orig) => ({
  ...(await orig<typeof import('./giftApi')>()),
  getOffer: vi.fn(), startCheckout: vi.fn(), checkBalance: vi.fn(),
}))
vi.mock('../../shared/payment/stripe', () => ({ stripeFor: () => null }))

const FEATURES = { reservations: true, ordering: true, catering: false, terminal: false, giftCards: true }
const site = (ui: React.ReactNode, features: Record<string, boolean> = FEATURES) =>
  render(<WithSite config={siteConfig({ features })}>{ui}</WithSite>)

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/presentkort')
  vi.mocked(api.getOffer).mockResolvedValue({ amountsSek: [250, 500], customMinSek: 100, customMaxSek: 5000, validityMonths: 24 })
})

describe('PresentkortPage', () => {
  it('starts the checkout with the chosen amount and remembers the purchase', async () => {
    vi.mocked(api.startCheckout).mockResolvedValue({ clientSecret: 'pi_1_secret', amountSek: 500, expiresAt: '2028-11-04T12:00:00Z', stripeAccount: 'acct_1' })
    site(<PresentkortPage />)
    fireEvent.click(await screen.findByRole('button', { name: '500 kr' }))
    fireEvent.change(screen.getByLabelText(/Din e-post/), { target: { value: 'kopare@example.se' } })
    fireEvent.change(screen.getByLabelText(/Mottagarens e-post/), { target: { value: 'sara@example.se' } })
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 500 kr' }))
    await waitFor(() => expect(api.startCheckout).toHaveBeenCalled())
    const [, body] = vi.mocked(api.startCheckout).mock.calls[0]
    expect(body).toMatchObject({ amountSek: 500, buyerEmail: 'kopare@example.se', recipientEmail: 'sara@example.se' })
    expect(window.sessionStorage.getItem('booqy-giftcard-purchase')).toContain(body.purchaseId)
    expect(await screen.findByText('Kortbetalningen är inte tillgänglig just nu.')).toBeInTheDocument()
  })

  it('refuses a custom amount outside the limits', async () => {
    site(<PresentkortPage />)
    fireEvent.change(await screen.findByLabelText(/Eget belopp/), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/Din e-post/), { target: { value: 'kopare@example.se' } })
    expect(screen.getByRole('button', { name: 'Till betalning, 50 kr' })).toBeDisabled()
  })

  it('shows the thank-you page after the 3-D Secure redirect', () => {
    window.history.replaceState(null, '', '/presentkort?klart=1&payment_intent=pi_1&redirect_status=succeeded')
    window.sessionStorage.setItem('booqy-giftcard-purchase', JSON.stringify({ purchaseId: 'p', amountSek: 250, expiresAt: '2028-11-04T12:00:00Z' }))
    site(<PresentkortPage />)
    expect(screen.getByText(/Presentkortet på 250 kr/)).toBeInTheDocument()
  })

  it('never thanks for a payment Stripe reports as failed', async () => {
    window.history.replaceState(null, '', '/presentkort?klart=1&payment_intent=pi_1&redirect_status=failed')
    window.sessionStorage.setItem('booqy-giftcard-purchase', JSON.stringify({ purchaseId: 'p', amountSek: 250, expiresAt: '2028-11-04T12:00:00Z' }))
    site(<PresentkortPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Betalningen gick inte igenom')
    expect(screen.queryByText('Tack för köpet!')).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('needs redirect_status, not just ?klart=1', async () => {
    window.history.replaceState(null, '', '/presentkort?klart=1')
    site(<PresentkortPage />)
    expect(await screen.findByRole('button', { name: '250 kr' })).toBeInTheDocument()
    expect(screen.queryByText('Tack för köpet!')).not.toBeInTheDocument()
  })

  it('says the bank is still processing when Stripe says processing', () => {
    window.history.replaceState(null, '', '/presentkort?klart=1&redirect_status=processing')
    site(<PresentkortPage />)
    expect(screen.getByText(/behandlas av banken/)).toBeInTheDocument()
  })

  it('says no gift cards are sold when the feature is off', async () => {
    site(<PresentkortPage />, { ...FEATURES, giftCards: false })
    expect(await screen.findByText(/säljer inga presentkort/)).toBeInTheDocument()
  })
})

describe('SaldoPage', () => {
  it('shows the balance for a code', async () => {
    vi.mocked(api.checkBalance).mockResolvedValue({ balanceSek: 380, balanceOre: 38000, expiresAt: '2028-11-04T12:00:00Z', status: 'active' })
    site(<SaldoPage />)
    fireEvent.change(screen.getByLabelText(/Kod/), { target: { value: 'abcd-efgh-jkmn-pqrs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Visa saldo' }))
    expect(await screen.findByText(/380 kr/)).toBeInTheDocument()
    expect(vi.mocked(api.checkBalance).mock.calls[0][1]).toBe('ABCD-EFGH-JKMN-PQRS')
  })
})

describe('GiftCardField', () => {
  it('opens and reports the code', () => {
    const onChange = vi.fn()
    render(<GiftCardField value="" onChange={onChange} totalOre={10000} />)
    fireEvent.click(screen.getByRole('button', { name: 'Har du ett presentkort?' }))
    fireEvent.change(screen.getByLabelText(/Presentkortskod/), { target: { value: 'abcd' } })
    expect(onChange).toHaveBeenCalledWith('ABCD')
  })
})
