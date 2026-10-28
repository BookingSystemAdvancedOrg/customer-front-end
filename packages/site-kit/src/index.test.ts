import { describe, expect, it } from 'vitest'
import * as kit from './index'
import * as testing from './testing'

/**
 * Det publika API:t som sajterna (site-template, site-<slug>) bygger på.
 * Att ta bort eller byta namn på något här är en major-version.
 */
const COMPONENTS = [
  'SiteProvider', 'Menu', 'CategoryNav', 'DishImage', 'Plate',
  'BookingFlow', 'ManageBooking', 'OrderFlow', 'OrderStatus', 'CateringFlow', 'CateringRequest',
  'OfferCard', 'FloorPlan3D', 'FloorPlanSvg', 'GuaranteeStep', 'TurnstileWidget',
  'PaymentTicket', 'PaymentPanel', 'AddToCalendar', 'Celebrate', 'DateInput', 'TimeInput',
  'DateTimeInput', 'FlowSteps', 'OpeningHoursModal', 'PhoneInput', 'ThemeToggle',
  'GuestDataNotice', 'MarketingConsent', 'PrivacyPolicy', 'CookiePolicy', 'BookingTermsPage', 'NoticeText',
] as const

const FUNCTIONS = [
  'configureSiteKit', 'siteKitConfig', 'useSite', 'useLocationInfo', 'useMenuList', 'useStickyCart', 'useTheme',
  'apiGet', 'apiPost', 'apiDelete', 'apiBaseUrl', 'isApiConfigured', 'getSiteConfig', 'siteQuery', 'isDevHost',
  'openStatus', 'businessHoursToRows', 'formatPrice', 'menuImageUrl', 'groupByCategory',
  'bookingTerms', 'toE164', 'formatPhone', 'buildIcs', 'googleCalendarUrl',
  'setTheme', 'currentTheme', 'trackPage', 'captureAttribution', 'paymentAppearance', 'stripeFor',
] as const

describe('@booqy/site-kit public API', () => {
  it.each(COMPONENTS)('exports the component %s', (name) => {
    expect(typeof kit[name]).toBe('function')
  })

  it.each(FUNCTIONS)('exports the function %s', (name) => {
    expect(typeof kit[name]).toBe('function')
  })

  it('groups each API client under its own namespace', () => {
    expect(typeof kit.bookingApi.getAvailability).toBe('function')
    expect(typeof kit.orderApi.createOrder).toBe('function')
    expect(typeof kit.cateringApi.createRequest).toBe('function')
    expect(typeof kit.menuApi.getPublicMenu).toBe('function')
    expect(typeof kit.offerApi.signUp).toBe('function')
    expect(typeof kit.layoutApi.getPublicActiveLayout).toBe('function')
  })

  it('reads its settings only from configureSiteKit', () => {
    kit.configureSiteKit({ apiBaseUrl: 'https://api.example.com', menuImageBaseUrl: 'https://cdn.example.com/' })
    expect(kit.apiBaseUrl()).toBe('https://api.example.com')
    expect(kit.menuImageUrl('menu-images/a.webp')).toBe('https://cdn.example.com/menu-images/a.webp')
    kit.configureSiteKit({ apiBaseUrl: 'https://api.test', menuImageBaseUrl: undefined })
  })

  it('lists every browser storage key for the cookie page', () => {
    expect(kit.STORAGE_REGISTRY.some((e) => e.name === kit.THEME_KEY)).toBe(true)
  })

  it('ships test helpers under /testing', () => {
    expect(typeof testing.WithSite).toBe('function')
    expect(testing.siteConfig().tenant.name).toBe('Testkrogen')
  })
})
