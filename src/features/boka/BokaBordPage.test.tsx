import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BokaBordPage, { SLOTS_REFRESH_MS } from './BokaBordPage'
import { WithSite } from '../../test/siteFixture'
import { guestView, json, partyOf, siteConfig } from '../../test/siteData'

// The bot check widget (Cloudflare) is never loaded in tests: a button hands
// the page a token, and every reset is recorded.
const turnstileResets: number[] = []
vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: ({ resetKey, onToken }: { resetKey: number; onToken: (t: string | null) => void }) => {
    turnstileResets.push(resetKey)
    return (
      <button type="button" onClick={() => onToken(`token-${resetKey}`)}>
        Jag är inte en robot
      </button>
    )
  },
}))

const LAYOUT = {
  floors: [],
  elements: [
    { elementId: 'table-a', type: 'table', x: 1, y: 0, z: 1, width: 1, height: 0.75, depth: 1, rotationY: 0, shape: 'rect', seats: 2, zone: 'main' },
    { elementId: 'table-b', type: 'table', x: 3, y: 0, z: 1, width: 1, height: 0.75, depth: 1, rotationY: 0, shape: 'rect', seats: 4, zone: 'main' },
  ],
}

function availability(tables = [{ tableId: 'table-a', seats: 2 }, { tableId: 'table-b', seats: 4 }]) {
  return {
    locationId: 'loc-1', date: 'x', timezone: 'Europe/Stockholm',
    slots: [
      { startTime: '18:00', endTime: '20:00', layoutVersion: 1, tables },
      { startTime: '20:00', endTime: '22:00', layoutVersion: 1, tables: [{ tableId: 'table-a', seats: 2 }] },
    ],
  }
}

let fetchMock: ReturnType<typeof vi.fn>
let bookingResponse: () => Response
let availabilityBody: ReturnType<typeof availability> & { day?: unknown }
let combos: { tableIds: string[]; minParty: number; maxParty: number }[] = []
const availabilityCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/availability')).length

beforeEach(() => {
  bookingResponse = () =>
    json({
      reservationId: 'r1', status: 'reserved', date: '2026-09-20', startTime: '18:00', endTime: '20:00',
      partySize: 3, tableIds: ['table-b'], customerName: 'Anna', cancellable: true,
      location: { locationId: 'loc-1', name: 'Testkrogen City', address: 'Gatan 1' },
      manageToken: 'tok123',
    }, 201)
  availabilityBody = availability()
  combos = []
  turnstileResets.length = 0
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/availability')) return json(guestView(availabilityBody, partyOf(url), combos))
    if (url.includes('/layout/active')) return json(LAYOUT)
    if (url.endsWith('/reservations') && init?.method === 'POST') return bookingResponse()
    return json({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function chooseAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
  await user.click(await screen.findByRole('button', { name: '18:00' }))
  // Only tables free at 18:00 are selectable; pick table-b (4 seats).
  await user.click(screen.getByRole('button', { name: /Bord 2 · 4 pl/ }))
  await user.type(screen.getByLabelText('Namn'), 'Anna')
  await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
  await user.type(screen.getByLabelText('Telefon'), '0701234567')
}

describe('BokaBordPage', () => {
  it('books a table end to end and shows the manage link', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)

    await chooseAndFill(user)
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('godkänna bokningsvillkoren')

    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

    expect(await screen.findByRole('heading', { name: 'Ditt bord är bokat' })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1].body)).toMatchObject({
      startTime: '18:00', tableIds: ['table-b'], partySize: 3, name: 'Anna',
      email: 'anna@example.se', phone: '0701234567', acceptTerms: true, marketingOptIn: false,
    })
    expect(screen.getByRole('link', { name: /\/bokning\/loc-1\/r1#tok123$/ })).toBeInTheDocument()
  })

  it('hides times that cannot seat the party', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await screen.findByRole('button', { name: '20:00' })
    await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
    expect(screen.queryByRole('button', { name: '20:00' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '18:00' })).toBeInTheDocument()
  })

  it('offers only the tables that fit the party, and asks the server for that party', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    expect(screen.queryByRole('button', { name: /Bord 1 · 2 pl/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Bord 2 · 4 pl/ })).toBeInTheDocument()
    const last = fetchMock.mock.calls.filter(([url]) => String(url).includes('/availability')).at(-1)!
    expect(String(last[0])).toContain('partySize=3')
  })

  it('books a combination the restaurant set up as one choice', async () => {
    const user = userEvent.setup()
    combos = [{ tableIds: ['table-a', 'table-b'], minParty: 5, maxParty: 6 }]
    bookingResponse = () => json({
      reservationId: 'r1', status: 'reserved', date: '2026-09-20', startTime: '18:00', endTime: '20:00',
      partySize: 6, tableIds: ['table-a', 'table-b'], customerName: 'Anna', cancellable: true, manageToken: 't',
    }, 201)
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.selectOptions(screen.getByLabelText('Antal personer'), '6')
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    await user.click(screen.getByRole('button', { name: 'Bord 1 + 2 · 6 pl' }))
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Telefon'), '0701234567')
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

    await screen.findByRole('heading', { name: 'Ditt bord är bokat' })
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1].body).tableIds).toEqual(['table-a', 'table-b'])
  })

  it('asks to pick again when the table was just taken, with fresh availability', async () => {
    const user = userEvent.setup()
    bookingResponse = () => json({ error: 'table_taken' }, 409)
    render(<WithSite><BokaBordPage /></WithSite>)
    await chooseAndFill(user)
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    const before = fetchMock.mock.calls.filter(([url]) => String(url).includes('/availability')).length

    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('hann bokas av någon annan')
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/availability')).length).toBe(before + 1),
    )
  })

  it('shows phone booking only when the plan has no reservations', () => {
    render(
      <WithSite config={siteConfig({ features: { reservations: false } })}>
        <BokaBordPage />
      </WithSite>,
    )
    expect(screen.getByText(/Ring oss på 08-123 456 78/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps the party size at the location online limit', () => {
    render(<WithSite><BokaBordPage /></WithSite>)
    const options = within(screen.getByLabelText('Antal personer')).getAllByRole('option')
    expect(options).toHaveLength(8)
  })

  it('drops a chosen time that went past the 30-minute limit on the minute refresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    expect(screen.getByRole('group', { name: 'Lediga bord' })).toBeInTheDocument()

    availabilityBody = { ...availability(), slots: availability().slots.filter((s) => s.startTime !== '18:00') }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOTS_REFRESH_MS)
    })

    expect(await screen.findByText('18:00 går inte att boka längre. Välj en annan tid.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '18:00' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Lediga bord' })).toBeNull()
    expect(screen.getByRole('button', { name: '20:00' })).toBeInTheDocument()
    expect(screen.queryByText('Hämtar lediga tider…')).toBeNull()
  })

  it('drops a chosen table that someone else booked, keeps the time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    await user.click(screen.getByRole('button', { name: /Bord 2 · 4 pl/ }))

    availabilityBody = availability([{ tableId: 'table-a', seats: 2 }])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOTS_REFRESH_MS)
    })

    expect(await screen.findByText('Bordet du valt har hunnit bokas. Välj bord igen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bord 1 · 2 pl/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /Bord 2 · 4 pl/ })).toBeNull()
    expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Namn')).toBeNull()
  })

  it('asks for a new time when the booking is refused for passing the 30-minute limit', async () => {
    const user = userEvent.setup()
    bookingResponse = () => json({ error: 'startTime is not a bookable time for this date' }, 400)
    render(<WithSite><BokaBordPage /></WithSite>)
    await chooseAndFill(user)
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    const before = availabilityCalls()

    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Tiden går inte att boka längre. Välj en annan tid.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('startTime')
    await waitFor(() => expect(availabilityCalls()).toBe(before + 1))
    expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByLabelText('Namn')).toBeNull()

    // Uppgifterna finns kvar till nästa försök.
    await user.click(screen.getByRole('button', { name: '18:00' }))
    await user.click(screen.getByRole('button', { name: /Bord 2 · 4 pl/ }))
    expect(screen.getByLabelText('Namn')).toHaveValue('Anna')
  })

  it('starts a new day without a chosen time', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    const days = within(screen.getByRole('group', { name: 'Välj datum' })).getAllByRole('button')

    await user.click(days[1])

    expect(await screen.findByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('group', { name: 'Lediga bord' })).toBeNull()
    expect(screen.queryByRole('status', { name: /går inte att boka/ })).toBeNull()
  })

  it('another party size asks for a new time', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.click(await screen.findByRole('button', { name: '20:00' }))
    await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
    await user.selectOptions(screen.getByLabelText('Antal personer'), '2')
    expect(await screen.findByRole('button', { name: '20:00' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('checks the phone number like the server does before sending', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    await user.click(screen.getByRole('button', { name: /Bord 2 · 4 pl/ }))
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Telefon'), '12345678')
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))

    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Fyll i ett giltigt telefonnummer, t.ex. 070-123 45 67.')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('keeps the times when a refresh fails on the network', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<WithSite><BokaBordPage /></WithSite>)
    await screen.findByRole('button', { name: '18:00' })
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOTS_REFRESH_MS)
    })

    expect(screen.getByRole('button', { name: '18:00' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('stops refreshing once the table is booked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<WithSite><BokaBordPage /></WithSite>)
    await chooseAndFill(user)
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    await screen.findByRole('heading', { name: 'Ditt bord är bokat' })
    const before = availabilityCalls()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOTS_REFRESH_MS * 2)
    })

    expect(availabilityCalls()).toBe(before)
  })

  it('explains a closed day and a day without online booking', async () => {
    const user = userEvent.setup()
    availabilityBody = { ...availability(), slots: [], day: { kind: 'closed', note: 'Privat fest' } }
    render(<WithSite><BokaBordPage /></WithSite>)
    expect(await screen.findByText('Vi har stängt den dagen (Privat fest).')).toBeInTheDocument()
    expect(screen.queryByText(/Inga lediga tider/)).toBeNull()

    availabilityBody = { ...availability(), slots: [], day: { kind: 'no_online' } }
    const days = within(screen.getByRole('group', { name: 'Välj datum' })).getAllByRole('button')
    await user.click(days[1])
    expect(await screen.findByText(/Den dagen går det inte att boka online\. Ring oss på 08-123 456 78\./))
      .toBeInTheDocument()
  })

  it('marks closed days in the date list', async () => {
    const config = siteConfig()
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
    const [y, m, d] = today.split('-').map(Number)
    const later = new Date(Date.UTC(y, m - 1, d + 2)).toISOString().slice(0, 10)
    config.locations[0].specialDays = [{ date: later, kind: 'closed', note: 'Julafton' }]
    render(<WithSite config={config}><BokaBordPage /></WithSite>)
    const days = within(screen.getByRole('group', { name: 'Välj datum' })).getAllByRole('button')
    expect(days[2]).toHaveTextContent('Stängt')
    expect(days[1]).not.toHaveTextContent('Stängt')
  })

  it('sends the bot check token and asks for a new one after a failed attempt', async () => {
    const user = userEvent.setup()
    const config = siteConfig()
    config.turnstile = { siteKey: '1x00000000000000000000AA' }
    bookingResponse = () => json({ error: 'table_taken' }, 409)
    render(<WithSite config={config}><BokaBordPage /></WithSite>)
    await chooseAndFill(user)
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))

    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bekräfta säkerhetskontrollen')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Jag är inte en robot' }))
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1].body).turnstileToken).toBe('token-0')
    expect(await screen.findByRole('alert')).toHaveTextContent('hann bokas av någon annan')

    // The token was used up: picking again shows a fresh widget, the old token isn't sent.
    await user.click(await screen.findByRole('button', { name: /Bord 2 · 4 pl/ }))
    expect(turnstileResets.at(-1)).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bekräfta säkerhetskontrollen')
  })

  it('asks for a reload when the server wants a bot check this page does not show', async () => {
    const user = userEvent.setup()
    bookingResponse = () => json({ error: 'turnstile token is required' }, 400)
    render(<WithSite config={siteConfig()}><BokaBordPage /></WithSite>)
    await chooseAndFill(user)
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ladda om sidan')
  })
})

