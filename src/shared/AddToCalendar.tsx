import { useMemo } from 'react'
import { buildIcs, calendarTarget, googleCalendarUrl, icsDataUrl } from './calendar'
import type { CalendarEvent } from './calendar'

const FILENAME = 'bokning.ics'

/**
 * "Lägg till i kalendern": Apple-enheter och okända får .ics-filen (Apple
 * Kalender öppnar den), Android får Google Kalender. Den lilla länken under
 * är det andra alternativet.
 */
export default function AddToCalendar({ event }: { event: CalendarEvent }) {
  const target = useMemo(() => calendarTarget(), [])
  const ics = useMemo(() => icsDataUrl(buildIcs(event)), [event])
  const google = useMemo(() => googleCalendarUrl(event), [event])
  const icsLink = { href: ics, download: FILENAME }
  const googleLink = { href: google, target: '_blank', rel: 'noopener noreferrer' }

  return (
    <div className="add-to-calendar">
      <a className="btn-primary" {...(target === 'android' ? googleLink : icsLink)}>
        Lägg till i kalendern
      </a>
      {target === 'android' ? (
        <a className="add-to-calendar-alt" {...icsLink}>Annan kalender (.ics)</a>
      ) : (
        <a className="add-to-calendar-alt" {...googleLink}>Google Kalender</a>
      )}
    </div>
  )
}
