import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BokaBordPage from './BokaBordPage'
import { WithSite } from '../../test/siteFixture'
import { json, siteConfig } from '../../test/siteData'

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

beforeEach(() => {
  bookingResponse = () =>
    json({
      reservationId: 'r1', status: 'reserved', date: '2026-09-20', startTime: '18:00', endTime: '20:00',
      partySize: 3, tableIds: ['table-b'], customerName: 'Anna', cancellable: true,
      location: { locationId: 'loc-1', name: 'Testkrogen City', address: 'Gatan 1' },
      manageToken: 'tok123',
    }, 201)
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/availability')) return json(availability())
    if (url.includes('/layout/active')) return json(LAYOUT)
    if (url.endsWith('/reservations') && init?.method === 'POST') return bookingResponse()
    return json({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

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

  it('requires enough seats before the details step', async () => {
    const user = userEvent.setup()
    render(<WithSite><BokaBordPage /></WithSite>)
    await user.selectOptions(screen.getByLabelText('Antal personer'), '3')
    await user.click(await screen.findByRole('button', { name: '18:00' }))
    await user.click(screen.getByRole('button', { name: /Bord 1 · 2 pl/ }))
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await user.click(screen.getByRole('button', { name: 'Boka bordet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('2 platser')
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
})
