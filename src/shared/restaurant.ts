/**
 * Restaurangens visningsuppgifter (Figma: KÄLLA-designen). Platsdata i
 * API:t (namn, adress, öppettider via GET /locations/{id}) kräver
 * inloggning, som kundsajten medvetet saknar — tills backend fått en publik
 * plats-endpoint redigeras uppgifterna här och följer med bygget.
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
  name: 'KÄLLA',
  /** Liten rad under logotypen. */
  logoTagline: 'Restaurang & bar',
  tagline:
    'Hantverksmat lagad från grunden — ur modern skandinavisk mylla, med säsongens råvaror i centrum.',
  announcement:
    'Fri hemkörning i hela Stockholm vid beställningar över 499 kr · Boka bord online',
  address: 'Storgatan 12, 112 24 Stockholm',
  phone: '08-123 45 67',
  email: 'info@kallarestaurang.se',
  openingHours: [
    { days: 'Mån–Tor', hours: '11:00–22:00' },
    { days: 'Fredag', hours: '11:00–23:00' },
    { days: 'Lördag', hours: '12:00–23:00' },
    { days: 'Söndag', hours: '12:00–21:00' },
  ] satisfies OpeningHoursRow[],
} as const

/**
 * Samma öppettider i maskinläsbar form, för bokningens tidsval.
 * Index enligt Date.getDay(): 0 = söndag … 6 = lördag.
 */
export const WEEKDAY_HOURS: readonly DayHours[] = [
  { opensAt: '12:00', closesAt: '21:00' }, // söndag
  { opensAt: '11:00', closesAt: '22:00' }, // måndag
  { opensAt: '11:00', closesAt: '22:00' }, // tisdag
  { opensAt: '11:00', closesAt: '22:00' }, // onsdag
  { opensAt: '11:00', closesAt: '22:00' }, // torsdag
  { opensAt: '11:00', closesAt: '23:00' }, // fredag
  { opensAt: '12:00', closesAt: '23:00' }, // lördag
]
