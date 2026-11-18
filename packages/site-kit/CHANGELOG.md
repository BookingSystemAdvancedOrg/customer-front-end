# Changelog

All notable changes to `@booqy/site-kit`. Semver: removing or renaming
anything exported from `index.ts`, `testing.ts` or `styles.css` (including a
CSS variable or class name a site styles) is a major version.

## Unreleased

- Table picker (step 3, 2D and 3D): tables that can be booked for the party
  are warm and light and breathe slowly (2.4 s, all in step); tables of the
  wrong size are dimmed and their title and tap say "För litet bord för 6" /
  "För stort bord för 2"; booked is muted red; the chosen table is filled and
  lifts. The legend matches. Picking a table (on the plan or its button) pops
  it, sends a ring out from it and lights its button for 0.5 s; then the page
  glides (about 0.6 s, eased) to Bekräfta bord and focus moves there. After
  the hold the page glides to the steps and focus moves to "Dina uppgifter".
  No animation with reduced motion. New colour tokens `--seat-free-hi`,
  `--seat-glow`, `--seat-ring` (with the existing `--seat-*`); the state
  rules live in `styles/table-picker.css`. Tables carry `data-table-id`.
- Card guarantee for a booking made by phone: `ManageBookingPage` shows the
  booking flow's card step (`GuaranteeStep`) while the booking is `pending`
  with `setup` in the guest view, comes back there from Stripe, confirms with
  the manage token and shows the saved guarantee. Hold time from
  `setup.expiresAt`. Card form not available while the hold runs
  (`setupUnavailable`): try again, not a new booking. A failed 3-D Secure
  redirect shows the bank error at the card form. `NOTHING_CHARGED` is
  "0 kr dras nu.". Same as site-kit 0.4.0.
- **Breaking:** the site builder is removed from Booqy. Gone:
  `sitePages.forhandsvisning`, `sitePages.builderPage`, the type
  `SiteBuilderState`, `SiteConfig.tenant.site`, and `"siteBuilder"` in
  `FEATURE_KEYS` and `SITE_CONFIG_FEATURES` (the generated contract).
  `SiteProvider` now always sets `document.title` to the restaurant's name.
- `Select`: a dropdown in the site's look instead of the system menu
  (ARIA select-only combobox, list in a portal, a sheet from the bottom on
  phones). Every dropdown in the kit uses it (`CategoryNav`, party size in
  `BookingFlow`, the waitlist); the `.party-stepper select`,
  `.booking-field select` rules now style `.combo`.
- The restaurant's own menu categories: `getPublicMenuWithCategories()`,
  `useMenuList().categories`, `groupByCategory(items, categories)` (groups
  carry a `label`; unknown categories last under Övrigt) and an optional
  `categories` prop on `CategoryNav`. `MenuCategory` is now a string;
  `CATEGORY_ORDER`/`CATEGORY_LABEL` stay as the four defaults.
- Allergens (`PublicMenuItem.allergens`, `allergenText()`) shown on `Menu`
  and the order page; option groups (`PublicMenuItem.options`) picked in a
  dialog when ordering, sent as `options` per line (the server prices them).
- `imageKey` may be null (a dish without photo shows the empty plate).
- Phone numbers: a Swedish mobile number typed without the 0 ("70 174 06 05")
  becomes +46701740605 in `PhoneInput`/`toE164` and is accepted by
  `normalizePhone`, which now lives in `shared/phone` and also refuses
  Swedish numbers of the wrong length (same rules as the server). New
  `formatPhoneNational` ("070-174 06 05"), `phoneHref` ("tel:+46701740605")
  and `PhoneLink`; the guest pages (also the privacy policy contact) show
  restaurant numbers that way. 010 and 020 numbers get a 2-digit prefix,
  and only the mobile series (070, 072, 073, 076, 079) are split as 07x, so
  "+46771123456" shows as "0771-12 34 56".
- `PublicMenuItem.imageFocus` (the dish photo's focal point, set in admin)
  and `menuImagePosition()`; `Menu` and the order pages crop dish photos
  at that point (`Plate` takes a `position`). Missing = the centre.

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
