import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentTicket } from './PaymentTicket'
import { payOutcome, paymentElementOptions } from './checkout'

const stripe = vi.hoisted(() => ({ confirm: vi.fn(), elementOptions: vi.fn() }))
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(async () => ({})) }))
vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PaymentElement: ({ onReady, options }: { onReady?: () => void; options?: unknown }) => {
    stripe.elementOptions(options)
    queueMicrotask(() => onReady?.())
    return <div>Stripes betalformulär</div>
  },
  useCheckoutElements: () => ({ type: 'success', checkout: { confirm: stripe.confirm } }),
}))

const session = (status: unknown) => ({ type: 'success', session: { status } })

function renderTicket(onPaid = vi.fn()) {
  render(
    <PaymentTicket publishableKey="pk_test_1" stripeAccount="acct_1" clientSecret="cs_test_1"
      payLabel="Betala 100 kr" onPaid={onPaid} />,
  )
  return onPaid
}

function phone(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches && query.includes('max-width'), media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }))
}

beforeEach(() => {
  stripe.confirm.mockReset()
  stripe.elementOptions.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('payOutcome', () => {
  it('is paid only when Stripe says the session is complete and paid', () => {
    expect(payOutcome({ status: { type: 'complete', paymentStatus: 'paid' } })).toBe('paid')
    expect(payOutcome({ status: { type: 'complete', paymentStatus: 'no_payment_required' } })).toBe('paid')
    expect(payOutcome({ status: { type: 'complete', paymentStatus: 'unpaid' } })).toBe('processing')
    expect(payOutcome({ status: { type: 'open' } })).toBe('processing')
    expect(payOutcome({ status: { type: 'expired' } })).toBe('processing')
    expect(payOutcome(undefined)).toBe('processing')
  })
})

describe('paymentElementOptions', () => {
  it('lists the methods with radios on a phone and keeps tabs on wider screens, wallets on and Link off', () => {
    const wallets = { applePay: 'auto', googlePay: 'auto', link: 'never' }
    expect(paymentElementOptions(true)).toEqual({
      layout: { type: 'accordion', radios: 'always', spacedAccordionItems: false }, wallets,
    })
    expect(paymentElementOptions(false)).toEqual({ layout: { type: 'tabs' }, wallets })
  })
})

describe('PaymentTicket', () => {
  it('picks the layout for the screen when the form is drawn', async () => {
    phone(true)
    renderTicket()
    await screen.findByText('Stripes betalformulär')
    expect(stripe.elementOptions).toHaveBeenLastCalledWith(expect.objectContaining({ layout: expect.objectContaining({ type: 'accordion' }) }))
  })

  it('tabs on a tablet or computer', async () => {
    phone(false)
    renderTicket()
    await screen.findByText('Stripes betalformulär')
    expect(stripe.elementOptions).toHaveBeenLastCalledWith(expect.objectContaining({ layout: { type: 'tabs' } }))
  })

  it('stamps Betalt when Stripe says paid, then hands over', async () => {
    const user = userEvent.setup()
    stripe.confirm.mockResolvedValue(session({ type: 'complete', paymentStatus: 'paid' }))
    const onPaid = renderTicket()
    await user.click(await screen.findByRole('button', { name: 'Betala 100 kr' }))
    expect(stripe.confirm).toHaveBeenCalledWith({ redirect: 'if_required' })
    expect(await screen.findByText('Betalt')).toHaveClass('stamp-ok')
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith('paid'), { timeout: 3000 })
  })

  it('a method still settling is never called paid: a calm processing state, then the status page', async () => {
    const user = userEvent.setup()
    stripe.confirm.mockResolvedValue(session({ type: 'complete', paymentStatus: 'unpaid' }))
    const onPaid = renderTicket()
    await user.click(await screen.findByRole('button', { name: 'Betala 100 kr' }))
    const stamp = await screen.findByText('Betalningen behandlas')
    expect(stamp).not.toHaveClass('stamp-ok')
    expect(stamp.closest('.pay-done')).toHaveClass('is-pending')
    expect(screen.getByText('Skickar dig vidare…')).toBeInTheDocument()
    expect(screen.queryByText('Betalt')).toBeNull()
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith('processing'), { timeout: 3000 })
  })

  it('the secure note names no single method', () => {
    renderTicket()
    expect(screen.getByText(/Betalningen sker hos Stripe/)).toHaveTextContent(
      'Betalningen sker hos Stripe. Dina betaluppgifter går direkt dit och sparas aldrig hos oss.',
    )
    expect(screen.queryByText(/Kortuppgifterna/)).toBeNull()
  })
})
