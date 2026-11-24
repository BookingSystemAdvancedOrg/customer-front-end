/**
 * @booqy/site-kit: allt på en restaurangs webbplats som inte är look.
 * API-klienten och vilken restaurang domänen tillhör, flödena (meny, boka
 * bord, beställ och betala, catering, öppettider, juridik), GDPR-rutorna,
 * besöksstatistiken och krokar för egna designer. Sajten (site-template /
 * site-<slug>) står för layout, sidor och look; komponenterna läser sina
 * färger, typsnitt, hörn och avstånd ur CSS-variabler (styles.css).
 *
 * Kom igång: configureSiteKit({...}) i main.tsx, <SiteProvider> runt appen
 * (inuti en router), importera '@booqy/site-kit/styles.css' före sajtens CSS.
 */

/* --- Inställningar ------------------------------------------------------- */
export { configureSiteKit, siteKitConfig } from './config'
export type { SiteKitConfig } from './config'

/* --- Restaurangen: sajtkonfiguration och vald plats -------------------- */
export { SiteProvider, accentPair, deepenForLight, liftForDark, textOn } from './shared/SiteProvider'
export { SiteContext, useSite } from './shared/SiteContext'
export type { SiteContextValue } from './shared/SiteContext'
export {
  getSiteConfig,
  isDevHost,
  pickLocation,
  readStoredLocation,
  siteQuery,
  storeLocation,
} from './shared/site'
export type {
  ConsentChannel,
  GuaranteeTerms,
  SiteBranding,
  SiteConfig,
  SiteLocation,
  SitePrivacy,
  SpecialDay,
} from './shared/site'
export type { LocationWaitlist, SiteFeatureKey, SiteSlotId } from './shared/contracts'

/* --- API --------------------------------------------------------------- */
export { ApiError, apiBaseUrl, apiDelete, apiGet, apiPost, isApiConfigured } from './shared/api'
export * as bookingApi from './features/boka/bookingApi'
export * as orderApi from './features/bestall/orderApi'
export * as cateringApi from './features/catering/cateringApi'
export * as menuApi from './features/meny/menuApi'
export * as offerApi from './features/erbjudande/offerApi'
export * as layoutApi from './shared/layoutApi'
export {
  businessHoursToRows,
  getPublicLocationInfo,
  openStatus,
  specialDayRows,
} from './shared/locationApi'
export type {
  BusinessHours,
  DayHoursRange,
  OpenStatus,
  OpeningHoursRow,
  PublicLocationInfo,
  SpecialDayRow,
  Weekday,
} from './shared/locationApi'

/* --- Krokar (egna designer) ---------------------------------------------- */
export { useLocationInfo } from './shared/useLocationInfo'
export type { LocationInfo } from './shared/useLocationInfo'
export { useMenuList } from './features/meny/useMenuList'
export { useStickyCart } from './shared/useStickyCart'
export { useTheme } from './shared/theme'

/* --- Meny ---------------------------------------------------------------- */
export { Menu } from './features/meny/Menu'
export { CategoryNav } from './features/meny/CategoryNav'
export { DishImage } from './features/meny/DishImage'
export { Plate } from './shared/Plate'
export {
  allergenText, CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_CATEGORIES, formatPrice, getPublicMenuWithCategories,
  groupByCategory, menuImagePosition, menuImageUrl,
} from './features/meny/menuApi'
export type { MenuCategory, MenuCategoryEntry, OptionGroup, PublicMenuItem } from './features/meny/menuApi'

/* --- Flöden ---------------------------------------------------------- */
export { default as BookingFlow } from './features/boka/BokaBordPage'
export { default as ManageBooking } from './features/bokning/ManageBookingPage'
export { default as OrderFlow } from './features/bestall/BestallPage'
export { default as KassanPage } from './features/bestall/KassanPage'
export { isTableQrLink } from './features/bestall/orderApi'
export { default as OrderStatus } from './features/bestall/OrderStatusPage'
export { default as CateringFlow } from './features/catering/CateringPage'
export { default as CateringRequest } from './features/catering/CateringRequestPage'
export { OfferCard } from './features/erbjudande/OfferCard'
export { FloorPlan3D } from './features/boka/FloorPlan3D'
export { FloorPlanSvg } from './features/boka/FloorPlanSvg'
export { GuaranteeConfirmation, GuaranteeNotice, GuaranteeStep, GuaranteeTermsText } from './features/boka/GuaranteeStep'

/* --- Betalning (Stripe Elements) ------------------------------------------ */
export { PaidStamp, PaymentPanel, PaymentPrinting, PaymentTicket, SecureNote } from './shared/payment/PaymentTicket'
export type { PayStatus } from './shared/payment/PaymentTicket'
export type { PayOutcome } from './shared/payment/checkout'
export type { PaidWith } from './shared/payment/paidWith'
export { paymentAppearance, paymentFonts } from './shared/payment/appearance'
export { stripeFor } from './shared/payment/stripe'

/* --- Byggstenar ---------------------------------------------------------- */
export { default as AddToCalendar } from './shared/AddToCalendar'
export { Celebrate } from './shared/Celebrate'
export { DateInput, DateTimeInput, TimeInput, parseDate, parseTime } from './shared/DateInput'
export { FlowSteps } from './shared/FlowSteps'
export { Select, SELECT_SHEET_QUERY } from './shared/Select'
export type { SelectGroup, SelectItem, SelectOption, SelectProps } from './shared/Select'
export type { FlowStep } from './shared/FlowSteps'
export { OpeningHoursModal } from './shared/OpeningHoursModal'
export { PhoneInput } from './shared/PhoneInput'
export { PhoneLink } from './shared/PhoneLink'
export { editPhone, formatPhone, formatPhoneNational, phoneHref, toE164 } from './shared/phone'
export { ThemeToggle } from './shared/ThemeToggle'
export { SoundToggle } from './shared/SoundToggle'
export { installSound, setSound, soundOn, useSound } from './shared/sound'
export { MoonIcon, SunIcon } from './shared/ThemeIcons'
export { applyTheme, currentTheme, setTheme, storedTheme, systemTheme } from './shared/theme'
export type { Theme } from './shared/theme'
export {
  bookingEvent,
  buildIcs,
  calendarTarget,
  googleCalendarUrl,
  icsDataUrl,
  zonedTimeToUtc,
} from './shared/calendar'
export type { BookingLike, CalendarEvent, CalendarTarget } from './shared/calendar'

/* --- GDPR, juridik och cookies --------------------------------------------- */
export { GuestDataNotice } from './shared/GuestDataNotice'
export type { NoticeKind } from './shared/GuestDataNotice'
export { MarketingConsent, NO_CONSENT, consentFields } from './shared/MarketingConsent'
export type { ConsentChoice } from './shared/MarketingConsent'
export { default as PrivacyPolicy } from './features/juridik/PrivacyPage'
export { default as CookiePolicy } from './features/juridik/CookiesPage'
export { default as BookingTermsPage } from './features/juridik/TermsPage'
export { sitePages } from './pages'
export { SkelCard } from './shared/Skeleton'
export { NoticeText, parseNotice } from './features/juridik/NoticeText'
export {
  bookingTerms,
  feeLines,
  formatDeadline,
  fromSnapshot,
  lateCancelApplies,
} from './shared/bookingTerms'
export type { TermsContext, TermsSection } from './shared/bookingTerms'
export { GIFT_CARD_PURCHASE_KEY, LANG_KEY, SOUND_KEY, STORAGE_REGISTRY, THEME_KEY, TICKET_PURCHASE_KEY, WAITLIST_TOKEN_PREFIX } from './shared/storageRegistry'
export type { StorageCategory, StorageEntry, StorageKind } from './shared/storageRegistry'

/* --- Språk (sv standard; en, es, ar, fa via Amazon Translate) ------------- */
export { LanguagePicker } from './shared/lang/LanguagePicker'
export { LanguageProvider } from './shared/lang/LanguageProvider'
export { useKeepTerms, useLanguage } from './shared/lang/LanguageContext'
export type { LanguageContextValue } from './shared/lang/LanguageContext'
export { DEFAULT_LANG, LANGUAGES, PARTIAL_NOTE, PICKER_LABEL, currentLang, isLang } from './shared/lang/languages'
export { prefetchTexts } from './shared/lang/loads'
export type { Lang, Language } from './shared/lang/languages'
export { Flag } from './shared/lang/flags'
export { MachineTranslationNote } from './shared/lang/MachineTranslationNote'
export { formatDate, formatNumber, formatTime, formatWeekday } from './shared/lang/format'

/* --- Besöksstatistik ------------------------------------------------------ */
export { captureAttribution, currentAttribution, trackOfferView, trackPage, withAttribution } from './shared/visits'
export type { Attribution } from './shared/visits'
