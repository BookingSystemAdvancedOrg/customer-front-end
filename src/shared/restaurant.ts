/**
 * Restaurangens visningsuppgifter. Platsdata i API:t (namn, adress,
 * öppettider via GET /locations/{id}) kräver inloggning, som kundsajten
 * medvetet saknar — tills backend fått en publik plats-endpoint redigeras
 * uppgifterna här och följer med bygget.
 */

export interface OpeningHoursRow {
  /** T.ex. "Mån–Tor" eller "Lördag". */
  days: string
  /** T.ex. "11:00–22:00" eller "Stängt". */
  hours: string
}

export const RESTAURANT = {
  name: 'Restaurangen',
  tagline: 'Säsongens råvaror, tillagade med omsorg.',
  address: 'Storgatan 1, 111 22 Stockholm',
  phone: '08-123 456 78',
  openingHours: [
    { days: 'Mån–Tor', hours: '11:00–22:00' },
    { days: 'Fre–Lör', hours: '11:00–23:00' },
    { days: 'Söndag', hours: '12:00–21:00' },
  ] satisfies OpeningHoursRow[],
}
