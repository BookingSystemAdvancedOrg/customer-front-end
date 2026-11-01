# Changelog

All notable changes to `@booqy/brand`. Semver: removing or renaming anything
exported from `index.ts` or `styles.css` (a component, a Bar variant, a
`--bq-*` variable or a `bq-` class), or changing a token's meaning, is a
major version. A new token, variant or component is a minor version.

## 0.1.0 (2026-11-01)

First version (Booqy Run 0, step 8b). Nothing in the apps is migrated yet
except one pilot per app; see `infrastructure/docs/design/DESIGN.md`.

- Tokens from one source (`tokens.json`), generated into CSS variables
  (light, dark, restaurant theme), TS constants, email JSON and Python.
- Effects: glass refraction, liquid fill, count-up, skeletons, receipt print,
  busy store, theme sweep, glide pill, press ripple and the click sound as a
  pre-rendered buffer (with the Safari wake-on-release handling).
- The Bar family: progress, busy, chart, meter (line, ring), tab, nav,
  action, banner.
- Components: Button, LinkButton, Card, Modal, Field, Input, Select,
  Skeleton, Toast, StatTile, Printing, BarChart, ColumnChart, CountUp.
- `brand-lint`: report-only scan per app, blocking for listed globs.
- A no-React build for booqy.se (`dist/static/brand-static-<version>.*`).
