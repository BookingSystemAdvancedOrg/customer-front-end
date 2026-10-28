# Changelog

All notable changes to `@booqy/site-kit`. Semver: removing or renaming
anything exported from `index.ts`, `testing.ts` or `styles.css` (including a
CSS variable or class name a site styles) is a major version.

## 0.1.0 (2026-10-27)

First version, extracted from `customer-front-end` with no visible change to
the site.

- API client (`apiGet`/`apiPost`/`apiDelete`, retries, `ApiError`) and tenant
  resolution (`SiteProvider`, `useSite`, `siteQuery`, `getSiteConfig`).
- Settings through `configureSiteKit` (API URL, dev tenant slug, menu image
  CDN, payment font files) instead of `import.meta.env`.
- Flows: `Menu`, `BookingFlow`, `ManageBooking`, `OrderFlow` (cart and
  checkout with Stripe Elements), `OrderStatus`, `CateringFlow`,
  `CateringRequest`, `OfferCard`.
- Building blocks: `OpeningHoursModal`, `AddToCalendar`, `DateInput`,
  `PhoneInput`, `FlowSteps`, `ThemeToggle`, `PaymentTicket`, floor plans.
- GDPR and legal: `GuestDataNotice`, `MarketingConsent`, `PrivacyPolicy`,
  `CookiePolicy`, `BookingTermsPage`, `STORAGE_REGISTRY`.
- Hooks for custom designs: `useSite`, `useLocationInfo`, `useMenuList`,
  `useStickyCart`, `useTheme`; API clients as namespaces (`bookingApi`,
  `orderApi`, `cateringApi`, `menuApi`, `offerApi`, `layoutApi`).
- Analytics: `trackPage`, `trackOfferView`, attribution.
- `styles.css`: the components' default look (Booqy's bongrail), driven by
  CSS variables in `theme.css` with light and dark mode.
- `@booqy/site-kit/testing`: `WithSite`, `siteConfig`, `json` for site tests.
