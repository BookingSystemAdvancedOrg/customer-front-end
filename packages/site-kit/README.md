# @booqy/site-kit

Everything on a restaurant's website that isn't the look: the API client and
tenant resolution, the booking, menu, ordering/checkout (Stripe Elements),
catering, opening hours, GDPR and legal flows, analytics, and hooks for
custom designs. A site (today `customer-front-end`, later `site-template` and
one `site-<slug>` per restaurant in the `booqy-sites` org) only holds layout,
pages and look. Plan: `application/docs/orchestrator/CUSTOMER-SITES-PLAN.md`.

## Use it in a site

```tsx
// main.tsx
import { SiteProvider, configureSiteKit } from '@booqy/site-kit'
import '@booqy/site-kit/styles.css' // before the site's own CSS
import './site.css'

configureSiteKit({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  devTenantSlug: import.meta.env.VITE_DEV_TENANT_SLUG,
  menuImageBaseUrl: import.meta.env.VITE_MENU_IMAGE_BASE_URL,
  paymentFonts: { sans: archivoUrl, mono: martianUrl }, // the site's woff2 files
})

// inside a router:
<SiteProvider><App /></SiteProvider>
```

Pages compose the flows: `<Menu />`, `<BookingFlow />`, `<OrderFlow />`,
`<CateringFlow />`, `<PrivacyPolicy />` and so on. The guest pages behind
links in SMS and email need their routes too: `bokning/:locationId/:reservationId`
(`ManageBooking`), `bestallning/:locationId/:orderId` (`OrderStatus`),
`catering/:locationId/:requestId` (`CateringRequest`). See
`customer-front-end/src/App.tsx`.

A fully custom design can skip the components and use the hooks
(`useSite`, `useMenuList`, `useLocationInfo`, `useStickyCart`, `useTheme`)
and the API namespaces (`bookingApi`, `orderApi`, `cateringApi`, ...).

## Theming

Components read CSS variables from `theme.css` (colours `--ink`, `--surface`,
`--accent`..., fonts `--font`/`--mono`, radius `--r-sm`/`--r-md`..., spacing
`--gutter`/`--wrap`), with Booqy's bongrail as the default. Override them in
the site's CSS, loaded after `styles.css`. Light/dark follows the system until
the guest picks one with `ThemeToggle` (`booqy-theme` in localStorage,
`data-theme` on `<html>`); set dark values under both
`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` and
`:root[data-theme='dark']`. The restaurant's own colour arrives as
`--tenant-accent*` from `SiteProvider`. Font files (`@font-face`) belong to the
site.

## Develop

In `customer-front-end` this is an npm workspace; the site reads the
package's source directly (export condition `@booqy/source`), so no build is
needed while developing. From the repo root:

```bash
npm test -w @booqy/site-kit
npm run build -w @booqy/site-kit
```

The build type checks, then writes ESM, types and `site-kit.css` to `dist/`.
Not published yet; it moves to the `booqy-sites` org and GitHub Packages in a
later phase (`publishConfig` already points there).
