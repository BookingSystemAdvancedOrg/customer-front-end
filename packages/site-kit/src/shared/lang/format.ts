import { currentLang, language } from './languages'

/**
 * Datum och tal i det valda språket (Intl), för sajtens egna texter.
 * Resultatet är redan på rätt språk: rendera det inuti translate="no" så att
 * översättaren låter det vara. Latinska siffror i alla språk; persiska
 * visas med gregoriansk kalender (aldrig den persiska för bokningar).
 *
 * Kitets egna flöden skriver datum på svenska i löpande text ("Tidigast
 * fredag 21 november"); de översätts med meningen, siffrorna skyddas.
 */

const locale = () => language(currentLang()).intlLocale
const TZ = 'Europe/Stockholm'

function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value
  // "2026-11-20" utan tid: mitt på dagen, så tidszonen aldrig byter dag.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`)
  return new Date(value)
}

/** "20 november 2026" / "20 November 2026" ... */
export function formatDate(value: Date | string | number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ, ...options }).format(
    toDate(value),
  )
}

/** "18:00", alltid 24-timmarsklocka. */
export function formatTime(value: Date | string | number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ, ...options }).format(
    toDate(value),
  )
}

/** "fredag" / "Friday" ... */
export function formatWeekday(value: Date | string | number, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: TZ, ...options }).format(toDate(value))
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale(), options).format(value)
}
