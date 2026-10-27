import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureAttribution, currentAttribution, resetVisitsForTests, trackPage, withAttribution } from './visits'

vi.mock('./api', () => ({ apiBaseUrl: () => 'https://api.test', isApiConfigured: () => true }))

describe('visits (cookieless)', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))

  beforeEach(() => {
    resetVisitsForTests()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockClear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads campaign tags once and keeps them in memory only', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    captureAttribution('?utm_source=Newsletter&utm_medium=email&utm_campaign=vår-meny&bq_c=0123456789abcdef', '')
    expect(currentAttribution()).toEqual({ source: 'newsletter', medium: 'email', campaign: 'vår-meny', campaignId: '0123456789abcdef' })
    expect(setItem).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
  })

  it('drops malformed tags and campaign ids', () => {
    captureAttribution('?utm_source=<script>&bq_c=nope', '')
    expect(currentAttribution()).toBeUndefined()
    expect(withAttribution({ a: 1 })).toEqual({ a: 1 })
  })

  it('adds attribution to request bodies', () => {
    captureAttribution('?utm_source=instagram&utm_medium=social', '')
    expect(withAttribution({ partySize: 2 })).toEqual({
      partySize: 2, attribution: { source: 'instagram', medium: 'social' },
    })
  })

  it('first page view is a visit, later ones are pages; ids never leave the path', () => {
    captureAttribution('', 'https://www.google.com/search?q=x')
    trackPage('loc-1', '/meny')
    trackPage('loc-1', '/bokning/loc-1/res-123')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    const first = JSON.parse(String(calls[0][1].body))
    const second = JSON.parse(String(calls[1][1].body))
    expect(calls[0][0]).toBe('https://api.test/t')
    expect(calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true })
    expect(first).toEqual({ locationId: 'loc-1', type: 'visit', path: '/meny', referrer: 'https://www.google.com/' })
    expect(second).toMatchObject({ type: 'page', path: '/bokning' })
  })

  it('ignores the site itself as referrer', () => {
    captureAttribution('', `${window.location.origin}/meny`)
    trackPage('loc-1', '/')
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ locationId: 'loc-1', type: 'visit', path: '/' })
  })
})
