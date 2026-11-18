import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WithSite } from '../../test/siteFixture'
import { siteConfig } from '../../test/siteData'
import GiftCardField from './GiftCardField'
import PresentkortPage from './PresentkortPage'
import SaldoPage from './SaldoPage'
import * as api from './giftApi'
import { ApiError } from '../../shared/api'

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
    fireEvent.click(await screen.findByRole('tab', { name: '500 kr' }))
    expect(screen.getByRole('tab', { name: '500 kr' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.change(screen.getByLabelText(/Din e-post/), { target: { value: 'kopare@example.se' } })
    fireEvent.change(screen.getByLabelText(/Mottagarens e-post/), { target: { value: 'sara@example.se' } })
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 500 kr' }))
    await waitFor(() => expect(api.startCheckout).toHaveBeenCalled())
    const [, body] = vi.mocked(api.startCheckout).mock.calls[0]
    expect(body).toMatchObject({ amountSek: 500, buyerEmail: 'kopare@example.se', recipientEmail: 'sara@example.se' })
    expect(window.sessionStorage.getItem('booqy-giftcard-purchase')).toContain(body.purchaseId)
    expect(await screen.findByText('Kortbetalningen är inte tillgänglig just nu.')).toBeInTheDocument()
  })

  it('shows the custom amount field only for Eget belopp and refuses an amount outside the limits', async () => {
    site(<PresentkortPage />)
    await screen.findByRole('tab', { name: '250 kr' })
    expect(screen.queryByLabelText(/^Belopp/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Eget belopp' }))
    fireEvent.change(screen.getByLabelText(/^Belopp/), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/Din e-post/), { target: { value: 'kopare@example.se' } })
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning' }))
    expect(await screen.findByText('Välj ett belopp mellan 100 och 5000 kr.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Belopp/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^Belopp/)).toHaveFocus()
    expect(api.startCheckout).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: '500 kr' }))
    expect(screen.queryByLabelText(/^Belopp/)).not.toBeInTheDocument()
  })

  it('keeps the button active and says the e-mail is missing', async () => {
    site(<PresentkortPage />)
    const button = await screen.findByRole('button', { name: 'Till betalning, 250 kr' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(await screen.findByText('Fyll i din e-post.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Din e-post/)).toHaveFocus()
    fireEvent.change(screen.getByLabelText(/Din e-post/), { target: { value: 'inte-en-adress' } })
    expect(screen.getByText('Kontrollera e-postadressen.')).toBeInTheDocument()
    expect(api.startCheckout).not.toHaveBeenCalled()
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
    expect(await screen.findByRole('tab', { name: '250 kr' })).toBeInTheDocument()
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

  it('prints a receipt while the offer loads', () => {
    vi.mocked(api.getOffer).mockReturnValue(new Promise(() => {}))
    site(<PresentkortPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Hämtar presentkorten')
  })

  it('offers a retry, not "no gift cards", when the offer fails to load', async () => {
    vi.mocked(api.getOffer).mockRejectedValueOnce(new ApiError(503, 'unavailable', { error: 'unavailable' }))
    site(<PresentkortPage />)
    expect(await screen.findByText(/Vi kunde inte hämta presentkorten just nu/)).toBeInTheDocument()
    expect(screen.queryByText(/säljer inga presentkort/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('tab', { name: '250 kr' })).toBeInTheDocument()
  })

  it('says no gift cards are sold when the offer is missing (404)', async () => {
    vi.mocked(api.getOffer).mockRejectedValueOnce(new ApiError(404, 'not_found', { error: 'not_found' }))
    site(<PresentkortPage />)
    expect(await screen.findByText(/säljer inga presentkort/)).toBeInTheDocument()
  })

  it('tells where the code goes under the recipient e-mail field', async () => {
    site(<PresentkortPage />)
    const input = await screen.findByLabelText(/^Mottagarens e-post \(valfritt\)/)
    expect(input).toHaveAccessibleDescription('Koden skickas dit.')
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

  it('can try again after a failed check, with no bot check step', async () => {
    vi.mocked(api.checkBalance).mockRejectedValue(new ApiError(404, 'not_found', { error: 'not_found' }))
    site(<SaldoPage />)
    fireEvent.change(screen.getByLabelText(/Kod/), { target: { value: 'abcd-efgh-jkmn-pqrs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Visa saldo' }))
    expect(await screen.findByText(/Vi hittar inget presentkort/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visa saldo' })).toBeEnabled()
    expect(vi.mocked(api.checkBalance).mock.calls[0]).toHaveLength(2)
  })

  it('says who acts when the bot check cannot load or does not pass', async () => {
    vi.mocked(api.checkBalance).mockRejectedValueOnce(new ApiError(0, 'bot_check_unavailable'))
    site(<SaldoPage />)
    fireEvent.change(screen.getByLabelText(/Kod/), { target: { value: 'abcd-efgh-jkmn-pqrs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Visa saldo' }))
    expect(await screen.findByText(/stäng av blockerande tillägg/)).toBeInTheDocument()
    vi.mocked(api.checkBalance).mockRejectedValueOnce(new ApiError(400, 'x', { code: 'bot_check_failed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visa saldo' }))
    expect(await screen.findByText(/Fungerar det ändå inte, kontakta restaurangen/)).toBeInTheDocument()
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
