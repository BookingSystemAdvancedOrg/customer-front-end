import { defineConfig, devices } from '@playwright/test'

/**
 * Guest-site UI suite: layout, accessibility and visual regression at every
 * common size, light and dark, against the BUILT site (same CSP as in
 * production) with a stubbed API (e2e-ui/lib/ui-api.ts). `npm run test:ui`.
 */
const PORT = Number(process.env.UI_PORT ?? 7073)

export default defineConfig({
  testDir: '.',
  testMatch: /\.ui\.ts$/,
  timeout: 90_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.2, animations: 'disabled', caret: 'hide' } },
  fullyParallel: true,
  workers: Number(process.env.UI_WORKERS ?? 4),
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/ui-results.json' }]],
  outputDir: 'test-results/ui',
  snapshotPathTemplate: 'baselines/{arg}{ext}',
  use: { baseURL: `http://localhost:${PORT}`, locale: 'sv-SE', timezoneId: 'Europe/Stockholm', reducedMotion: 'reduce', screenshot: 'only-on-failure', actionTimeout: 10_000, navigationTimeout: 30_000 },
  webServer: {
    command: `npx vite build --outDir e2e-ui/.dist --emptyOutDir && npx vite preview --outDir e2e-ui/.dist --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 240_000,
    env: { VITE_API_BASE_URL: 'https://api.e2e.test', VITE_DEV_TENANT_SLUG: 'testkrogen', VITE_MENU_IMAGE_BASE_URL: 'https://img.e2e.test' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@x/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@x/ },
  ],
})
