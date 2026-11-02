# Changelog

All notable changes to `@booqy/brand`. Semver: removing or renaming anything
exported from `index.ts` or `styles.css` (a component, a Bar variant, a
`--bq-*` variable or a `bq-` class), or changing a token's meaning, is a
major version. A new token, variant or component is a minor version.

## Unreleased (minor: next version 0.2.0)

Run 0 addendum, task BRK1 (events and tickets, ADR-K; phone agent, ADR-L).

- `Bar variant="live"`: a call in progress (`kind="call"`, green dot,
  "Pågående samtal") or a recording (`kind="recording"`, red dot,
  "Spelas in"); polite status text, optional `detail` (elapsed time) outside
  the live region; reduced motion: static dot.
- `Chip`: a status as text on a tone pair (`neutral/info/success/warning/danger`,
  optional decorative `icon`), for ticket status and call outcome.
- `Card surface="ticket"`: event ticket with mono details, notches and a
  dashed perforation, and a stub with the QR on a white plate (`qr`) and the
  typed code (`code`); follows the theme, the QR stays dark on white.
- Token `--bq-shadow-drop` (a `filter` value per mode) for shapes cut by a
  mask, such as the ticket.
- `brand-lint`: `Chip` joins the catalogue (a local `Chip` is a duplicate).

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
