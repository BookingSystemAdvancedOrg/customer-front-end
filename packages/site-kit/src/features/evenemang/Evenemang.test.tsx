import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/api'
import { WithSite } from '../../test/siteFixture'
import { siteConfig } from '../../test/siteData'
import BiljettPage from './BiljettPage'
import EvenemangDetaljPage from './EvenemangDetaljPage'
import EvenemangPage from './EvenemangPage'
import TaEmotPage from './TaEmotPage'
import * as api from './eventsApi'
import type { PublicEvent, TicketPageData } from './eventsApi'

vi.mock('./eventsApi', async (orig) => ({
  ...(await orig<typeof import('./eventsApi')>()),
  listEvents: vi.fn(), getEvent: vi.fn(), checkout: vi.fn(), getTickets: vi.fn(),
  giveTicket: vi.fn(), cancelGift: vi.fn(), acceptGift: vi.fn(),
}))
vi.mock('../../shared/payment/stripe', () => ({ stripeFor: () => null }))
// Turnstile-attrapp: visar sin resetKey och ger en token per återställning.
vi.mock('../boka/TurnstileWidget', () => ({
  TurnstileWidget: ({ resetKey, onToken }: { resetKey: number; onToken: (t: string) => void }) => (
    <button type="button" onClick={() => onToken(`tok-${resetKey}`)}>{`turnstile ${resetKey}`}</button>
  ),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async (data: string) => `data:image/png;base64,${btoa(data)}`) } }))

const FEATURES = { reservations: true, ordering: false, catering: false, terminal: false, events: true }

function site(path: string, routePath: string, ui: React.ReactNode, config = siteConfig({ features: FEATURES })) {
  return render(
    <WithSite config={config} path={path}>
      <Routes>
        <Route path={routePath} element={ui} />
        <Route path="/biljett" element={<BiljettPage />} />
      </Routes>
    </WithSite>,
  )
}

const EVENT: PublicEvent = {
  eventId: 'ev1abcdef', title: 'Vinprovning', description: 'Fem viner från Rhône.', refundPolicy: 'Ingen återbetalning efter 7 dagar före.',
  perOrderMax: 4,
  occurrences: [
    { occurrenceId: 'ev1abcdef-2026-11-20T18:00:00Z', startAt: '2026-11-20T18:00:00Z', endAt: '2026-11-20T21:00:00Z', left: 3, soldOut: false, salesOpen: true },
    { occurrenceId: 'ev1abcdef-2026-11-27T18:00:00Z', startAt: '2026-11-27T18:00:00Z', endAt: '2026-11-27T21:00:00Z', left: 0, soldOut: true, salesOpen: true },
  ],
  ticketTypes: [
    { typeId: 'vuxen0001', name: 'Vuxen', priceSek: 450, perOrderMax: 4, available: true, includes: 'Fem glas och ost' },
    { typeId: 'tidig0001', name: 'Tidig fågel', priceSek: 350, perOrderMax: 2, available: false },
  ],
}

const TICKETS: TicketPageData = {
  event: { eventId: 'ev1abcdef', title: 'Vinprovning', refundPolicy: null },
  occurrence: { occurrenceId: 'ev1abcdef-2026-11-20T18:00:00Z', startAt: '2026-11-20T18:00:00Z', doorsAt: '2026-11-20T17:30:00Z', status: 'scheduled' },
  location: { locationId: 'loc-1', name: 'Testkrogen City' },
  tickets: [
    { ticketId: 'tk1aaaaaaaa', typeName: 'Vuxen', holderName: 'Sara Ek', status: 'valid', qr: 'tk1aaaaaaaa.0123456789abcdef' },
    { ticketId: 'tk2aaaaaaaa', typeName: 'Vuxen', holderName: 'Sara Ek', status: 'checked_in' },
  ],
  wallet: { apple: false, google: false },
  transferAllowed: true,
  resaleAllowed: false,
}

const fillBuyer = () => {
  fireEvent.change(screen.getByLabelText(/^Namn/), { target: { value: 'Sara Ek' } })
  fireEvent.change(screen.getByLabelText(/^E-post/), { target: { value: 'sara@example.se' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.mocked(api.getEvent).mockResolvedValue(EVENT)
})

describe('EvenemangPage', () => {
  it('lists the upcoming events with the price or Slutsålt and links each one', async () => {
    vi.mocked(api.listEvents).mockResolvedValue({ events: [
      { eventId: 'ev1abcdef', title: 'Vinprovning', nextOccurrence: '2026-11-20T18:00:00Z', fromPriceSek: 350, soldOut: false },
      { eventId: 'ev2abcdef', title: 'Quiz', nextOccurrence: '2026-11-21T18:00:00Z', fromPriceSek: 100, soldOut: true },
    ] })
    site('/evenemang', '/evenemang', <EvenemangPage />)
    expect(await screen.findByRole('link', { name: 'Vinprovning' })).toHaveAttribute('href', '/evenemang/ev1abcdef')
    expect(screen.getByText('Från 350 kr')).toBeInTheDocument()
    expect(screen.getByText('Slutsålt')).toHaveClass('bq-chip')
    expect(screen.getByText(/fredag 20 november kl. 19:00/)).toBeInTheDocument()
  })

  it('shows Gratis, not Från 0 kr, for a free event', async () => {
    vi.mocked(api.listEvents).mockResolvedValue({ events: [
      { eventId: 'ev2abcdef', title: 'Quiz', nextOccurrence: '2026-11-21T18:00:00Z', fromPriceSek: 0, soldOut: false },
    ] })
    site('/evenemang', '/evenemang', <EvenemangPage />)
    expect(await screen.findByText('Gratis')).toBeInTheDocument()
    expect(screen.queryByText(/Från 0 kr/)).not.toBeInTheDocument()
  })

  it('shows nothing about events when the API answers 404 (feature off)', async () => {
    vi.mocked(api.listEvents).mockRejectedValue(new ApiError(404, 'not found'))
    site('/evenemang', '/evenemang', <EvenemangPage />)
    expect(await screen.findByText(/har inga evenemang till salu just nu/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Vinprovning/ })).not.toBeInTheDocument()
  })
})

describe('EvenemangDetaljPage', () => {
  const open = () => site('/evenemang/ev1abcdef', '/evenemang/:eventId', <EvenemangDetaljPage />)

  it('says the event is missing on 404', async () => {
    vi.mocked(api.getEvent).mockRejectedValue(new ApiError(404, 'not found'))
    open()
    expect(await screen.findByText('Evenemanget finns inte eller säljs inte längre här.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Evenemang' })).toBeInTheDocument()
  })

  it('shows the dates, disables sold-out ones and caps the count at the seats left', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'Vinprovning' })).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toBeChecked()
    expect(radios[1]).toBeDisabled()
    expect(screen.getByText('3 platser kvar')).toBeInTheDocument()
    const more = screen.getByRole('button', { name: 'En Vuxen till' })
    for (let i = 0; i < 3; i++) fireEvent.click(more)
    expect(screen.getByLabelText('Antal Vuxen')).toHaveTextContent('3')
    expect(more).toBeDisabled()
    expect(screen.getByRole('button', { name: 'En Tidig fågel till' })).toBeDisabled()
    expect(screen.getByText('Totalt 1 350 kr')).toBeInTheDocument()
  })

  it('holds the seats with the chosen lines and buyer, then shows the payment step', async () => {
    vi.mocked(api.checkout).mockResolvedValue({ clientSecret: 'pi_1_secret', amountSek: 900, expiresAt: '2026-11-05T12:15:00Z', stripeAccount: 'acct_1' })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'En Vuxen till' }))
    fireEvent.click(screen.getByRole('button', { name: 'En Vuxen till' }))
    expect(screen.getByRole('button', { name: 'Till betalning, 900 kr' })).toBeDisabled()
    fillBuyer()
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 900 kr' }))
    await waitFor(() => expect(api.checkout).toHaveBeenCalled())
    const [locationId, body] = vi.mocked(api.checkout).mock.calls[0]
    expect(locationId).toBe('loc-1')
    expect(body).toMatchObject({ occurrenceId: EVENT.occurrences[0].occurrenceId, lines: [{ typeId: 'vuxen0001', qty: 2 }],
      buyerName: 'Sara Ek', buyerEmail: 'sara@example.se' })
    expect(body.orderId).toMatch(/^[0-9a-f]{32}$/)
    expect(await screen.findByText(/Platserna hålls till kl. 13:15/)).toBeInTheDocument()
    expect(screen.getByText('Kortbetalningen är inte tillgänglig just nu.')).toBeInTheDocument()
    expect(window.sessionStorage.getItem('booqy-ticket-purchase')).toContain(body.orderId)
  })

  it('confirms a free order at once (no Stripe)', async () => {
    vi.mocked(api.getEvent).mockResolvedValue({ ...EVENT, ticketTypes: [{ typeId: 'gratis001', name: 'Fri entré', priceSek: 0, perOrderMax: 2, available: true }] })
    vi.mocked(api.checkout).mockResolvedValue({ amountSek: 0, expiresAt: '2026-11-05T12:15:00Z' })
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'En Fri entré till' }))
    fillBuyer()
    fireEvent.click(screen.getByRole('button', { name: 'Hämta biljetterna' }))
    expect(await screen.findByRole('heading', { name: 'Klart!' })).toBeInTheDocument()
    expect(screen.getByText(/kommer via e-post/)).toBeInTheDocument()
  })

  it('explains sold_out, reloads the event and uses a new order id next time', async () => {
    vi.mocked(api.checkout).mockRejectedValueOnce(new ApiError(409, 'sold_out', { error: 'sold_out', code: 'sold_out' }))
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'En Vuxen till' }))
    fillBuyer()
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 450 kr' }))
    expect(await screen.findByText(/Det finns inte så många platser kvar/)).toBeInTheDocument()
    await waitFor(() => expect(api.getEvent).toHaveBeenCalledTimes(2))
    vi.mocked(api.checkout).mockResolvedValueOnce({ amountSek: 450, expiresAt: '2026-11-05T12:15:00Z', clientSecret: 's', stripeAccount: 'a' })
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 450 kr' }))
    await waitFor(() => expect(api.checkout).toHaveBeenCalledTimes(2))
    const ids = vi.mocked(api.checkout).mock.calls.map(([, b]) => b.orderId)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('asks for a fresh Turnstile check after Ändra biljetterna', async () => {
    const config = { ...siteConfig({ features: FEATURES }), turnstile: { siteKey: 'site-key' } }
    vi.mocked(api.checkout).mockResolvedValue({ clientSecret: 's', amountSek: 450, expiresAt: '2026-11-05T12:15:00Z', stripeAccount: 'a' })
    site('/evenemang/ev1abcdef', '/evenemang/:eventId', <EvenemangDetaljPage />, config)
    fireEvent.click(await screen.findByRole('button', { name: 'En Vuxen till' }))
    fillBuyer()
    fireEvent.click(screen.getByRole('button', { name: 'turnstile 0' }))
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 450 kr' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ändra biljetterna' }))
    // Den använda token är borta: knappen väntar på en ny kontroll.
    expect(screen.getByRole('button', { name: 'Till betalning, 450 kr' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'turnstile 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 450 kr' }))
    await waitFor(() => expect(api.checkout).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.checkout).mock.calls.map(([, b]) => b.turnstileToken)).toEqual(['tok-0', 'tok-1'])
  })

  it('keeps the choice within the seats left after the event is reloaded on sold_out', async () => {
    vi.mocked(api.checkout).mockRejectedValueOnce(new ApiError(409, 'sold_out', { error: 'sold_out', code: 'sold_out' }))
    vi.mocked(api.getEvent).mockResolvedValueOnce(EVENT).mockResolvedValueOnce({
      ...EVENT, occurrences: [{ ...EVENT.occurrences[0], left: 1 }, EVENT.occurrences[1]],
    })
    open()
    const more = await screen.findByRole('button', { name: 'En Vuxen till' })
    for (let i = 0; i < 3; i++) fireEvent.click(more)
    fillBuyer()
    fireEvent.click(screen.getByRole('button', { name: /^Till betalning, 1.350 kr$/ }))
    expect(await screen.findByText(/Det finns inte så många platser kvar/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Antal Vuxen')).toHaveTextContent('1'))
    expect(screen.getByText('Totalt 450 kr')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En Vuxen till' })).toBeDisabled()
    vi.mocked(api.checkout).mockResolvedValueOnce({ amountSek: 450, expiresAt: '2026-11-05T12:15:00Z', clientSecret: 's', stripeAccount: 'a' })
    fireEvent.click(screen.getByRole('button', { name: 'Till betalning, 450 kr' }))
    await waitFor(() => expect(api.checkout).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.checkout).mock.calls[1][1].lines).toEqual([{ typeId: 'vuxen0001', qty: 1 }])
  })

  it('thanks after the 3-D Secure redirect only when Stripe says it succeeded', async () => {
    window.history.replaceState(null, '', '/evenemang/ev1abcdef?klart=1&redirect_status=succeeded')
    window.sessionStorage.setItem('booqy-ticket-purchase', JSON.stringify({ orderId: 'o', eventId: 'ev1abcdef', title: 'Vinprovning', amountSek: 900, qty: 2 }))
    open()
    expect(screen.getByRole('heading', { name: 'Tack för köpet!' })).toBeInTheDocument()
    expect(screen.getByText(/De 2 biljetterna till Vinprovning är betalda \(900 kr\)/)).toBeInTheDocument()
  })

  it('never thanks for a payment Stripe reports as failed', async () => {
    window.history.replaceState(null, '', '/evenemang/ev1abcdef?klart=1&redirect_status=failed')
    open()
    expect(await screen.findByText(/Betalningen gick inte igenom och inget har dragits/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tack för köpet!' })).not.toBeInTheDocument()
  })
})

describe('BiljettPage', () => {
  it('asks for the email link when there is no token', () => {
    site('/biljett', '/x', <span />)
    expect(screen.getByText(/Öppna länken i mejlet/)).toBeInTheDocument()
    expect(api.getTickets).not.toHaveBeenCalled()
  })

  it('shows each ticket with its status, the QR and the code for the door', async () => {
    vi.mocked(api.getTickets).mockResolvedValue(TICKETS)
    site('/biljett#abc.def', '/x', <span />)
    expect(await screen.findByText('Vinprovning')).toBeInTheDocument()
    expect(api.getTickets).toHaveBeenCalledWith('abc.def')
    expect(screen.getByText('Giltig')).toHaveClass('bq-chip--success')
    expect(screen.getByText('Insläppt')).toHaveClass('bq-chip--info')
    const qr = await screen.findByRole('img', { name: 'QR-kod för Vuxen (1 av 2)' })
    expect(qr.getAttribute('src')).toBe(`data:image/png;base64,${btoa('tk1aaaaaaaa.0123456789abcdef')}`)
    expect(screen.getByText('tk1aaaaaaaa.0123456789abcdef')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByText('Insläpp från kl. 18:30')).toBeInTheDocument()
    expect(screen.queryByText(/Wallet/)).not.toBeInTheDocument()
  })

  it('says the link is invalid on 404', async () => {
    vi.mocked(api.getTickets).mockRejectedValue(new ApiError(404, 'not found'))
    site('/biljett#abc.def', '/x', <span />)
    expect(await screen.findByText(/Länken gäller inte/)).toBeInTheDocument()
  })

  it('gives a ticket away and can undo it while it is pending', async () => {
    vi.mocked(api.getTickets).mockResolvedValueOnce(TICKETS)
    vi.mocked(api.giveTicket).mockResolvedValue({ transferId: 't', ticketId: 'tk1aaaaaaaa', status: 'pending' })
    vi.mocked(api.getTickets).mockResolvedValueOnce({ ...TICKETS, tickets: [{ ...TICKETS.tickets[0], pendingTransferId: 'tr1aaaaaaaa' }] })
    site('/biljett#abc.def', '/x', <span />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ge bort biljetten' }))
    fireEvent.change(screen.getByLabelText(/Mottagarens e-post/), { target: { value: 'van@example.se' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka biljetten' }))
    await waitFor(() => expect(api.giveTicket).toHaveBeenCalled())
    expect(vi.mocked(api.giveTicket).mock.calls[0][1]).toMatchObject({ ticketId: 'tk1aaaaaaaa', toEmail: 'van@example.se' })
    vi.mocked(api.cancelGift).mockResolvedValue(null)
    fireEvent.click(await screen.findByRole('button', { name: 'Ångra gåvan' }))
    await waitFor(() => expect(api.cancelGift).toHaveBeenCalledWith('abc.def', 'tr1aaaaaaaa'))
  })

  it('does not offer the gift when transfers are closed', async () => {
    vi.mocked(api.getTickets).mockResolvedValue({ ...TICKETS, transferAllowed: false })
    site('/biljett#abc.def', '/x', <span />)
    const card = (await screen.findByRole('img', { name: /QR-kod/ })).closest('section') as HTMLElement
    expect(within(card).getByText(/kan inte ges bort/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ge bort biljetten' })).not.toBeInTheDocument()
  })
})

describe('TaEmotPage', () => {
  it('accepts the gift with the name and opens the new ticket page', async () => {
    vi.mocked(api.acceptGift).mockResolvedValue({ ticketToken: 'new.token' })
    vi.mocked(api.getTickets).mockResolvedValue(TICKETS)
    site('/biljett/ta-emot#gift.tok', '/biljett/ta-emot', <TaEmotPage />)
    fireEvent.change(screen.getByLabelText(/Ditt namn/), { target: { value: 'Vân' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ta emot biljetten' }))
    await waitFor(() => expect(api.acceptGift).toHaveBeenCalledWith('gift.tok', 'Vân'))
    await waitFor(() => expect(api.getTickets).toHaveBeenCalledWith('new.token'))
  })

  it('explains a gift that was undone', async () => {
    vi.mocked(api.acceptGift).mockRejectedValue(new ApiError(409, 'invalid_state', { error: 'invalid_state', code: 'invalid_state' }))
    site('/biljett/ta-emot#gift.tok', '/biljett/ta-emot', <TaEmotPage />)
    fireEvent.change(screen.getByLabelText(/Ditt namn/), { target: { value: 'Vân' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ta emot biljetten' }))
    expect(await screen.findByText(/gåvan har ångrats/)).toBeInTheDocument()
  })
})
