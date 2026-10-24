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
let holdResponse: () => Response
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
  holdResponse = () =>
    json({
      holdId: 'h'.repeat(32), manageToken: 'tok123', expiresAt: '2026-09-08T12:15:00Z', holdMinutes: 15,
      date: '2026-09-20', startTime: '18:00', endTime: '20:00', tableIds: ['table-b'], partySize: 3,
      cardRequired: false,
    }, 201)
  availabilityBody = availability()
  combos = []
  turnstileResets.length = 0
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/availability')) return json(guestView(availabilityBody, partyOf(url), combos))
    if (url.includes('/layout/active')) return json(LAYOUT)
    if (url.endsWith('/reservations') && init?.method === 'POST') return bookingResponse()
    if (url.endsWith('/holds') && init?.method === 'POST') return holdResponse()
    if (url.includes('/holds/') && init?.method === 'DELETE') return json({ released: true })
    return json({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const posts = (path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(path) && init?.method === 'POST')
const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')

async function chooseTable(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
  await user.click(await screen.findByRole('button', { name: '18:00' }))
  // Only tables free at 18:00 are selectable; pick table-b (4 seats).
  await user.click(screen.getByRole('button', { name: /Bord 2 · 4 platser/ }))
}

async function chooseAndFill(user: ReturnType<typeof userEvent.setup>) {
  await chooseTable(user)
  await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
  await user.type(await screen.findByLabelText('Namn'), 'Anna')
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
    const [hold] = posts('/holds')
    expect(JSON.parse(hold[1].body)).toEqual({ date: expect.any(String), startTime: '18:00', tableIds: ['table-b'], partySize: 3 })
    const [post] = posts('/reservations')
    expect(JSON.parse(post[1].body)).toMatchObject({
      startTime: '18:00', tableIds: ['table-b'], partySize: 3, name: 'Anna', holdId: 'h'.repeat(32),
      email: 'anna@example.se', phone: '+46701234567', acceptTerms: true,
    })
    // Inget samtycke utan kryss: fälten skickas inte alls.
    expect(JSON.parse(post[1].body)).not.toHaveProperty('marketingConsent')
    expect(JSON.parse(post[1].body)).not.toHaveProperty('marketingOptIn')
    expect((post[1].headers as Record<string, string>)['X-Manage-Token']).toBe('tok123')
    expect(screen.getByRole('link', { name: /\/bokning\/loc-1\/r1#tok123$/ })).toBeInTheDocument()
    const ics = decodeURIComponent(screen.getByRole('link', { name: 'Lägg till i kalendern' }).getAttribute('href')!.split(',')[1])
    expect(ics).toContain('UID:r1@booqy.se')
    expect(ics.replace(/\r\n /g, '')).toContain('/bokning/loc-1/r1#tok123')
  })

  it('shows the booking length and extendability before and after confirming', async () => {
    const user = userEvent.setup()
    availabilityBody.slots[0] = { ...availabilityBody.slots[0], endTime: '19:30', durationMinutes: 90, extendable: true, ruleName: null } as typeof availabilityBody.slots[0]
    holdResponse = () =>
      json({
        holdId: 'h'.repeat(32), manageToken: 'tok123', expiresAt: '2026-09-08T12:15:00Z', holdMinutes: 15,
        date: '2026-09-20', startTime: '18:00', endTime: '19:30', tableIds: ['table-b'], partySize: 3,
        cardRequired: false, durationMinutes: 90, extendable: true, ruleName: null,
      }, 201)
    bookingResponse = () =>
      json({
        reservationId: 'r1', status: 'reserved', date: '2026-09-20', startTime: '12:00', endTime: '13:00',
        partySize: 3, tableIds: ['table-b'], customerName: 'Anna', cancellable: true, manageToken: 'tok123',
        durationMinutes: 60, extendable: false, ruleName: 'Lunchbuffé',
      }, 201)
    render(<WithSite><BokaBordPage /></WithSite>)
    await chooseTable(user)
    expect(screen.getByText('Bokningstid: 1 tim 30 min, kan förlängas på plats om bordet är ledigt.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    expect(await screen.findByText(/Bokningstid: 1 tim 30 min/)).toBeInTheDocument()
    await user.type(await screen.findByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Telefon'), '0701234567')
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    expect(await screen.findByText('60 min (Lunchbuffé), kan inte förlängas')).toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: /Bord 1 · 2 platser/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Bord 2 · 4 platser/ })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /^Bord 1 \+ 2 · 6 platser/ }))
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    await user.type(await screen.findByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Telefon'), '0701234567')
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

    await screen.findByRole('heading', { name: 'Ditt bord är bokat' })
    expect(JSON.parse(posts('/holds')[0][1].body).tableIds).toEqual(['table-a', 'table-b'])
  })

  it('asks to pick again when the table was just taken, with fresh availability', async () => {
    const user = userEvent.setup()
    holdResponse = () => json({ error: 'table_taken' }, 409)
    render(<WithSite><BokaBordPage /></WithSite>)
    await chooseTable(user)
    const before = fetchMock.mock.calls.filter(([url]) => String(url).includes('/availability')).length

    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))

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
    await user.click(screen.getByRole('button', { name: /Bord 2 · 4 platser/ }))

    availabilityBody = availability([{ tableId: 'table-a', seats: 2 }])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOTS_REFRESH_MS)
    })

    expect(await screen.findByText('Bordet du valt har hunnit bokas. Välj bord igen.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bord 1 · 2 platser/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /Bord 2 · 4 platser/ })).toBeNull()
    expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Namn')).toBeNull()
  })

  it('asks for a new time when the table is refused for passing the 30-minute limit', async () => {
    const user = userEvent.setup()
    holdResponse = () => json({ error: 'startTime is not a bookable time for this date' }, 400)
    render(<WithSite><BokaBordPage /></WithSite>)
    await chooseTable(user)
    const before = availabilityCalls()

    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Tiden går inte att boka längre. Välj en annan tid.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('startTime')
    await waitFor(() => expect(availabilityCalls()).toBe(before + 1))
    expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByLabelText('Namn')).toBeNull()
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
    await user.click(screen.getByRole('button', { name: /Bord 2 · 4 platser/ }))
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    await user.type(await screen.findByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.type(screen.getByLabelText('Telefon'), '12345678')
    await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))

    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Fyll i ett giltigt telefonnummer, t.ex. 070-123 45 67.')
    expect(posts('/reservations')).toHaveLength(0)
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

  it('shows where the guest is in the flow', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    expect(screen.getByRole('list', { name: 'Bokning: steg 2 av 5' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    expect(screen.getByRole('list', { name: 'Bokning: steg 3 av 5' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Bord 1 · 2 platser/ }))
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    expect(await screen.findByRole('list', { name: 'Bokning: steg 4 av 5' })).toBeInTheDocument()
  })

  it('offers the next day when there are no free times', async () => {
    const user = userEvent.setup()
    availabilityBody = { ...availability(), slots: [] }
    render(<WithSite><BokaBordPage /></WithSite>)
    expect(await screen.findByText(/Inga lediga tider för 2 personer/)).toBeInTheDocument()
    const days = within(screen.getByRole('group', { name: 'Välj datum' })).getAllByRole('button')
    await user.click(screen.getByRole('button', { name: 'Prova nästa dag' }))
    expect(days[1]).toHaveAttribute('aria-pressed', 'true')
  })

  it('lets the guest try again when the times could not be fetched', async () => {
    const user = userEvent.setup()
    let failing = true
    const base = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (failing && String(url).includes('/availability')) return json({ error: 'unavailable' }, 503)
      return base(url, init)
    })
    render(<WithSite><BokaBordPage /></WithSite>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Vi kunde inte hämta tiderna just nu.')
    failing = false
    await user.click(screen.getByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('button', { name: '18:00' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
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

  it('sends the bot check token when confirming the table and asks for a new one after a failed attempt', async () => {
    const user = userEvent.setup()
    const config = siteConfig()
    config.turnstile = { siteKey: '1x00000000000000000000AA' }
    holdResponse = () => json({ error: 'table_taken' }, 409)
    render(<WithSite config={config}><BokaBordPage /></WithSite>)
    await chooseTable(user)

    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bekräfta säkerhetskontrollen')
    expect(posts('/holds')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Jag är inte en robot' }))
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    expect(JSON.parse(posts('/holds')[0][1].body).turnstileToken).toBe('token-0')
    expect(await screen.findByRole('alert')).toHaveTextContent('hann bokas av någon annan')

    // The token was used up: picking again shows a fresh widget, the old token isn't sent.
    await user.click(await screen.findByRole('button', { name: /Bord 2 · 4 platser/ }))
    expect(turnstileResets.at(-1)).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bekräfta säkerhetskontrollen')
  })

  it('asks for a reload when the server wants a bot check this page does not show', async () => {
    const user = userEvent.setup()
    holdResponse = () => json({ error: 'turnstile token is required' }, 400)
    render(<WithSite config={siteConfig()}><BokaBordPage /></WithSite>)
    await chooseTable(user)
    await user.click(screen.getByRole('button', { name: 'Bekräfta bord' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ladda om sidan')
  })

  describe('the table is held for 15 minutes', () => {
    it('counts down and hides the earlier steps while the guest fills in the form', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<WithSite><BokaBordPage /></WithSite>)
      await chooseAndFill(user)

      expect(screen.getByRole('timer')).toHaveTextContent('Bord 2 hålls åt dig i 15:00')
      expect(screen.queryByRole('button', { name: '18:00' })).toBeNull()
      expect(screen.queryByLabelText('Antal personer')).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000)
      })
      expect(screen.getByRole('timer')).toHaveTextContent('13:59')
    })

    it('when the time runs out the tables are let go and everything starts over', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<WithSite><BokaBordPage /></WithSite>)
      await chooseAndFill(user)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15 * 60_000 + 1000)
      })

      expect(await screen.findByRole('alert')).toHaveTextContent('Tiden för att slutföra bokningen (15 minuter) gick ut')
      const [del] = deletes()
      expect(String(del[0])).toContain(`/holds/${'h'.repeat(32)}`)
      expect((del[1].headers as Record<string, string>)['X-Manage-Token']).toBe('tok123')
      expect(screen.queryByLabelText('Namn')).toBeNull()
      expect(screen.queryByRole('timer')).toBeNull()
      expect(screen.getByLabelText('Antal personer')).toHaveValue('2')
      expect(screen.getByLabelText('Antal personer')).toBeEnabled()
      expect(await screen.findByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'false')
      expect(posts('/reservations')).toHaveLength(0)
    })

    it('Byt bord lets go of the tables and goes back to choosing', async () => {
      const user = userEvent.setup()
      render(<WithSite><BokaBordPage /></WithSite>)
      await chooseAndFill(user)

      await user.click(screen.getByRole('button', { name: 'Byt bord' }))

      expect(deletes()).toHaveLength(1)
      expect(screen.queryByLabelText('Namn')).toBeNull()
      expect(screen.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'true')
      expect(await screen.findByRole('button', { name: /Bord 2 · 4 platser/ })).toHaveAttribute('aria-pressed', 'false')
    })

    it('starts over when the server says the hold already ran out', async () => {
      const user = userEvent.setup()
      bookingResponse = () => json({ error: 'hold_expired' }, 409)
      render(<WithSite><BokaBordPage /></WithSite>)
      await chooseAndFill(user)
      await user.click(screen.getByRole('checkbox', { name: /bokningsvillkoren/ }))
      await user.click(screen.getByRole('button', { name: 'Boka bordet' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('gick ut och bordet släpptes')
      expect(screen.queryByLabelText('Namn')).toBeNull()
    })

    it('lets go of the tables when the guest leaves the page', async () => {
      const user = userEvent.setup()
      const { unmount } = render(<WithSite><BokaBordPage /></WithSite>)
      await chooseAndFill(user)
      unmount()
      const [del] = deletes()
      expect((del[1] as RequestInit).keepalive).toBe(true)
    })
  })
})


describe('BokaBordPage - why a table cannot be chosen', () => {
  it('explains a table that is too small for the party when it is tapped', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
    await user.click(await screen.findByRole('button', { name: '18:00' }))

    // The 2-seat table is shown, marked and tappable - but not selectable.
    const small = screen.getByRole('button', { name: /^Bord 1, 2 platser, går inte att välja: 1-2 pers$/ })
    expect(small).not.toHaveAttribute('aria-pressed')
    await user.click(small)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Bord 1 tar 1-2 personer - ni är 3 personer. Välj ett större bord.')
    expect(screen.queryByRole('button', { name: 'Bekräfta bord' })).toBeNull()

    // The legend and the full list of reasons are there too.
    expect(screen.getByRole('list', { name: 'Förklaring' })).toHaveTextContent('Spärrat')
    expect(screen.getByText(/Varför kan jag inte välja vissa bord\? \(1\)/)).toBeInTheDocument()

    // Choosing a table that fits clears the explanation.
    await user.click(screen.getByRole('button', { name: /Bord 2 · 4 platser/ }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('tells a table blocked by the restaurant from one that is booked', async () => {
    availabilityBody = {
      ...availability([{ tableId: 'table-b', seats: 4 }]),
      slots: [{
        startTime: '18:00', endTime: '20:00', layoutVersion: 1, tables: [{ tableId: 'table-b', seats: 4 }],
        unavailable: [{ tableId: 'table-a', reason: 'blocked' }],
      }],
    } as unknown as typeof availabilityBody
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.selectOptions(screen.getByLabelText('Antal personer'), '2')
    await user.click(await screen.findByRole('button', { name: '18:00' }))

    await user.click(screen.getByRole('button', { name: /^Bord 1, 2 platser, går inte att välja: spärrat$/ }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Bord 1 är spärrat av restaurangen kl 18:00 och kan inte bokas online.')
  })

  it('says when the chosen tables are put together', async () => {
    combos = [{ tableIds: ['table-a', 'table-b'], minParty: 5, maxParty: 6 }]
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.selectOptions(screen.getByLabelText('Antal personer'), '5')
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    const combo = screen.getByRole('button', { name: /^Bord 1 \+ 2 · 6 platser/ })
    expect(combo).toHaveTextContent('Bord 1 + 2 · 6 platser · ställs ihop')
    await user.click(combo)
    expect(screen.getByText('Borden 1 och 2 ställs ihop för ert sällskap.')).toBeInTheDocument()
  })
})
