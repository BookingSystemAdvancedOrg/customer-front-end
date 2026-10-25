import { describe, expect, it } from 'vitest'
import {
  bookingEvent,
  buildIcs,
  calendarTarget,
  escapeText,
  foldLine,
  googleCalendarUrl,
  restaurantName,
  zonedTimeToUtc,
} from './calendar'

const BOOKING = {
  reservationId: 'r1', date: '2026-09-20', startTime: '18:00', endTime: '20:00',
  timezone: 'Europe/Stockholm', partySize: 3,
}
const NOW = new Date('2026-09-18T10:00:00Z')
const octets = (s: string) => new TextEncoder().encode(s).length

describe('zonedTimeToUtc', () => {
  it('summer time is UTC+2, winter time UTC+1', () => {
    expect(zonedTimeToUtc('2026-09-20', '18:00').toISOString()).toBe('2026-09-20T16:00:00.000Z')
    expect(zonedTimeToUtc('2026-12-20', '18:00').toISOString()).toBe('2026-12-20T17:00:00.000Z')
  })

  it('handles the DST change days', () => {
    // 29 mars 2026: klockan går 02:00 -> 03:00. 25 oktober: 03:00 -> 02:00.
    expect(zonedTimeToUtc('2026-03-29', '01:30').toISOString()).toBe('2026-03-29T00:30:00.000Z')
    expect(zonedTimeToUtc('2026-03-29', '18:00').toISOString()).toBe('2026-03-29T16:00:00.000Z')
    expect(zonedTimeToUtc('2026-10-25', '18:00').toISOString()).toBe('2026-10-25T17:00:00.000Z')
    expect(zonedTimeToUtc('2026-10-24', '18:00').toISOString()).toBe('2026-10-24T16:00:00.000Z')
  })

  it('falls back to Stockholm for an unknown zone', () => {
    expect(zonedTimeToUtc('2026-09-20', '18:00', 'Nowhere/City').toISOString()).toBe('2026-09-20T16:00:00.000Z')
  })
})

describe('bookingEvent', () => {
  it('uses the booking length, address, party size and link', () => {
    const event = bookingEvent({ ...BOOKING, durationMinutes: 150 }, {
      restaurant: 'Pizzeria Roma', address: 'Götgatan 1, Stockholm', link: 'https://x.se/bokning/l/r1#t',
    })
    expect(event).toEqual({
      uid: 'r1@booqy.se',
      title: 'Bord hos Pizzeria Roma',
      start: new Date('2026-09-20T16:00:00Z'),
      end: new Date('2026-09-20T18:30:00Z'),
      location: 'Götgatan 1, Stockholm',
      description: 'Bord för 3 personer.\nSe eller avboka: https://x.se/bokning/l/r1#t',
    })
  })

  it('without a length uses the end time, past midnight on the next day', () => {
    const event = bookingEvent({ ...BOOKING, startTime: '22:00', endTime: '00:30', partySize: 1 }, { restaurant: 'R' })
    expect(event.end.toISOString()).toBe('2026-09-20T22:30:00.000Z')
    expect(event.description).toBe('Bord för 1 person.')
    expect(event.location).toBeUndefined()
  })
})

describe('buildIcs', () => {
  it('is RFC 5545: CRLF, escaped text, UTC times, stable UID', () => {
    const event = bookingEvent(BOOKING, { restaurant: 'Roma; Söder, Åre', address: 'Götgatan 1, Stockholm', link: null })
    const ics = buildIcs(event, NOW)
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    const lines = ics.split('\r\n')
    expect(lines).toContain('UID:r1@booqy.se')
    expect(lines).toContain('DTSTAMP:20260918T100000Z')
    expect(lines).toContain('DTSTART:20260920T160000Z')
    expect(lines).toContain('DTEND:20260920T180000Z')
    expect(lines).toContain('SUMMARY:Bord hos Roma\\; Söder\\, Åre')
    expect(lines).toContain('LOCATION:Götgatan 1\\, Stockholm')
    expect(lines).toContain('METHOD:PUBLISH')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
  })

  it('folds long lines at 75 octets without splitting å, ä, ö', () => {
    const long = 'Bord hos ' + 'åäö'.repeat(40)
    const ics = buildIcs({ uid: 'u', title: long, start: NOW, end: NOW }, NOW)
    for (const line of ics.split('\r\n')) expect(octets(line)).toBeLessThanOrEqual(75)
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain(`SUMMARY:${long}`)
  })
})

describe('helpers', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })

  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:kort')).toBe('SUMMARY:kort')
  })

  it('builds the Google Calendar link', () => {
    const url = new URL(googleCalendarUrl(bookingEvent(BOOKING, { restaurant: 'Roma', address: 'Gatan 1' })))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('dates')).toBe('20260920T160000Z/20260920T180000Z')
    expect(url.searchParams.get('text')).toBe('Bord hos Roma')
    expect(url.searchParams.get('location')).toBe('Gatan 1')
  })

  it('names the restaurant like the e-mails', () => {
    expect(restaurantName('Roma', 'Södermalm')).toBe('Roma Södermalm')
    expect(restaurantName('Roma Södermalm', 'Södermalm')).toBe('Roma Södermalm')
    expect(restaurantName(undefined, 'Södermalm')).toBe('Södermalm')
  })

  it('detects the device', () => {
    expect(calendarTarget({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toBe('apple')
    expect(calendarTarget({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe('apple')
    expect(calendarTarget({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' })).toBe('android')
    expect(calendarTarget({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('other')
  })
})
