/**
 * "Lägg till i kalendern": en bokning som kalenderhändelse, som .ics-fil
 * (RFC 5545) eller som Google Kalender-länk. Samma UID som .ics-filen i
 * bekräftelsemejlet (application/shared/calendar_invite.py), så att lägga
 * till igen uppdaterar samma händelse i stället för att skapa en ny.
 */

export interface CalendarEvent {
  uid: string
  title: string
  start: Date
  end: Date
  location?: string
  description?: string
}

export type CalendarTarget = 'apple' | 'android' | 'other'

const DEFAULT_TZ = 'Europe/Stockholm'
const UID_DOMAIN = 'booqy.se'

/** Restaurangens namn som i mejlen: "Roma Södermalm", eller bara det ena. */
export function restaurantName(tenantName?: string | null, locationName?: string | null): string {
  const tenant = tenantName?.trim() ?? ''
  const location = locationName?.trim() ?? ''
  if (tenant && location && !tenant.toLowerCase().includes(location.toLowerCase())) return `${tenant} ${location}`
  return tenant || location || 'Restaurangen'
}

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs
}

/** "2026-09-20" + "18:00" i restaurangens tidszon -> exakt tidpunkt (UTC). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string = DEFAULT_TZ): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  let zone = timeZone
  try {
    offsetMs(wall, zone)
  } catch {
    zone = DEFAULT_TZ
  }
  // Två varv: offset vid gissningen, sedan vid resultatet (sommartidsbyte).
  const guess = wall - offsetMs(wall, zone)
  return new Date(wall - offsetMs(guess, zone))
}

export interface BookingLike {
  reservationId: string
  date: string
  startTime: string
  endTime: string
  timezone?: string
  partySize: number
  durationMinutes?: number
}

/** Bokningen som händelse: start, slut (bokningstiden), adress, antal och länk. */
export function bookingEvent(
  booking: BookingLike,
  { restaurant, address, link }: { restaurant: string; address?: string | null; link?: string | null },
): CalendarEvent {
  const start = zonedTimeToUtc(booking.date, booking.startTime, booking.timezone || DEFAULT_TZ)
  let end: Date
  if (booking.durationMinutes && booking.durationMinutes > 0) {
    end = new Date(start.getTime() + booking.durationMinutes * 60_000)
  } else {
    end = zonedTimeToUtc(booking.date, booking.endTime, booking.timezone || DEFAULT_TZ)
    if (end <= start) end = new Date(end.getTime() + 24 * 3_600_000)
  }
  const guests = booking.partySize === 1 ? '1 person' : `${booking.partySize} personer`
  const lines = [`Bord för ${guests}.`]
  if (link) lines.push(`Se eller avboka: ${link}`)
  return {
    uid: `${booking.reservationId}@${UID_DOMAIN}`,
    title: `Bord hos ${restaurant}`,
    start,
    end,
    location: address || undefined,
    description: lines.join('\n'),
  }
}

/** 2026-09-20T16:00:00Z -> "20260920T160000Z". */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** TEXT-värde enligt RFC 5545 3.3.11. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

const encoder = new TextEncoder()

/** Viker en innehållsrad vid 75 oktetter (RFC 5545 3.1), aldrig mitt i ett tecken. */
export function foldLine(line: string): string {
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const bytes = encoder.encode(ch).length
    // Fortsättningsrader börjar med ett blanksteg, som räknas in i 75.
    if (size + bytes > 75) {
      out.push(current)
      current = ' '
      size = 1
    }
    current += ch
    size += bytes
  }
  out.push(current)
  return out.join('\r\n')
}

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Booqy//Bordsbokning//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ]
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function icsDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`,
  })
  if (event.location) params.set('location', event.location)
  if (event.description) params.set('details', event.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** iPhone, iPad (som säger Macintosh) och Mac: Apple Kalender. Android: Google. */
export function calendarTarget(nav: { userAgent: string } = navigator): CalendarTarget {
  const ua = nav.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua)) return 'apple'
  return 'other'
}
