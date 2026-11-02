/**
 * Flödena som laddare: en sajt som vill hålla första laddningen liten kan
 * använda dem med React.lazy, så hämtas t.ex. bokningen eller betalningen
 * först när gästen öppnar den sidan. Samma komponenter som de vanliga
 * exporterna (BookingFlow, OrderFlow ...).
 */
export const sitePages = {
  booking: () => import('./features/boka/BokaBordPage'),
  manageBooking: () => import('./features/bokning/ManageBookingPage'),
  order: () => import('./features/bestall/BestallPage'),
  orderStatus: () => import('./features/bestall/OrderStatusPage'),
  catering: () => import('./features/catering/CateringPage'),
  cateringRequest: () => import('./features/catering/CateringRequestPage'),
  privacy: () => import('./features/juridik/PrivacyPage'),
  cookies: () => import('./features/juridik/CookiesPage'),
  bookingTerms: () => import('./features/juridik/TermsPage'),
  presentkort: () => import('./features/presentkort/PresentkortPage'),
  presentkortSaldo: () => import('./features/presentkort/SaldoPage'),
  ko: () => import('./features/ko/KoPage'),
  forhandsvisning: () => import('./features/site-builder/PreviewPage'),
  builderPage: () => import('./features/site-builder/BuilderPage'),
}
