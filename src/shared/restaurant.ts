/**
 * Restaurangens visningsuppgifter (design portad från
 * github.com/AryaEisa/anar - den riktiga ANAR Restaurang & Bar).
 *
 * Namn/adress/kontakt/öppettider hämtas numera live från den publika
 * GET /locations/{id}/public-info (se locationApi.ts + LocationInfoContext)
 * - värdena här under är bara startfallbacken tills det svaret kommit, och
 * det som visas om anropet misslyckas eller API:t inte är konfigurerat.
 * Fallbackvärdena är satta till Anars riktiga, publicerade uppgifter.
 * Tagline/logoTagline/announcement är ren varumärkestext och finns inte i
 * API:t, så de är alltid statiska.
 */

export interface OpeningHoursRow {
  /** T.ex. "Mån–Tor" eller "Lördag". */
  days: string
  /** T.ex. "11:00–22:00" eller "Stängt". */
  hours: string
}

/** Öppettider per veckodag (0 = söndag, som Date.getDay()). */
export interface DayHours {
  opensAt: string
  closesAt: string
}

export const RESTAURANT = {
  name: 'Anar',
  /** Liten rad under logotypen. */
  logoTagline: 'Restaurang & Bar',
  tagline:
    'Persisk och afghansk mat i Linköping - à la carte, kolgrill och en varm gästfrihet som känns äkta.',
  address: 'Djurgårdsgatan 33A, 582 29 Linköping',
  phone: '013-123 45 67',
  email: 'info@anarrestaurang.se',
  openingHours: [
    { days: 'Tis–Tor', hours: '11:00–21:00' },
    { days: 'Fredag', hours: '11:00–22:00' },
    { days: 'Lördag', hours: '12:00–22:00' },
    { days: 'Sön–Mån', hours: 'Stängt' },
  ] satisfies OpeningHoursRow[],
} as const

/**
 * Samma öppettider i maskinläsbar form, för bokningens tidsval.
 * Index enligt Date.getDay(): 0 = söndag … 6 = lördag.
 */
export const WEEKDAY_HOURS: readonly DayHours[] = [
  { opensAt: '00:00', closesAt: '00:00' }, // söndag (stängt)
  { opensAt: '00:00', closesAt: '00:00' }, // måndag (stängt)
  { opensAt: '11:00', closesAt: '21:00' }, // tisdag
  { opensAt: '11:00', closesAt: '21:00' }, // onsdag
  { opensAt: '11:00', closesAt: '21:00' }, // torsdag
  { opensAt: '11:00', closesAt: '22:00' }, // fredag
  { opensAt: '12:00', closesAt: '22:00' }, // lördag
]
