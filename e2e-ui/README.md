# Guest site UI tests (layout, accessibility, visual)

Playwright suite for the guest site (including `packages/site-kit`). It builds
the site like production (same CSP) and serves it with `vite preview`; the API
is stubbed (`lib/ui-api.ts`, reusing `../e2e/fakeApi.ts` for events and
tickets), with every feature on so every route has data. Run from the
`customer-front-end` folder.

```bash
npm ci
npx playwright install chromium webkit firefox
npm run test:ui                         # all sizes, Chromium + WebKit + Firefox (@x)
npx playwright test -c e2e-ui/playwright.config.ts --project=chromium -g "meny 390"
npm run test:ui:update                  # rewrite the baselines (review the diff!)
node e2e-ui/summarize-ui.mjs            # ranked findings
```

Port: `UI_PORT` (default 7073); workers: `UI_WORKERS`. The unit tests (vitest)
and the build ignore this folder.

## What it checks

Every page x every size x light and dark (where the app has both):

- Sizes (Chromium): 320, 360, 375, 390, 414 (phones), 768 and 820 portrait,
  1024 and 1180 landscape (tablets), 1280, 1440, 1920, 2560 (desktop).
  WebKit (Safari) and Firefox run 390, 820 and 1440 (tests tagged `@x`). The Firefox build that Playwright 1.63 installs on the dev Mac does not start ("Could not find profile folder"), so Firefox has not been run yet; run `--project=firefox` on CI or after a Playwright update.
- Layout (`lib/ui-audit.ts`, identical in all four apps): no sideways page
  scroll, nothing cut off at the window edge, text not clipped, nothing
  covering a button or input, fixed bars, dialogs and drawers inside the window
  (and scrollable if taller), the floating help button overlapping nothing
  (fixed bars anywhere, any content at the end of the page), tap targets of at
  least 44 px on phones (reported as `low`, never fails the run), visible
  keyboard focus on the first tab stops.
- Accessibility: `@axe-core/playwright`, serious and critical only.
- Visual regression: `toHaveScreenshot` at the sizes in `VISUAL`
  (`UI_VISUAL_SIZES`, default `360,1280`, to keep the repo small), animations
  off, reduced motion, fixed clock. Baselines are macOS Chromium; update them
  on a Mac.
- Every test appends its findings to `test-results/ui-issues.jsonl`;
  `node summarize-ui.mjs` ranks them by severity (`--json out.json` for the
  report).

Specs are named `*.ui.ts` so the app's own unit tests never pick them up.
