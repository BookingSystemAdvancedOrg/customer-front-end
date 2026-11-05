import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright e2e mot den byggda sajten (samma CSP som i drift) och ett
 * påhittat API: varje test svarar på https://api.e2e.test/** och
 * js.stripe.com själv (e2e/fakeApi.ts), så inget går ut på nätet.
 * `npm run test:e2e`; `SCREENSHOTS=1 npm run test:e2e` skriver även
 * skärmbilderna i docs/screenshots/. Webbläsare: `npx playwright install
 * chromium`, eller en befintlig Chrome med PLAYWRIGHT_CHROME=1.
 */
const PORT = 7072

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'sv-SE',
    timezoneId: 'Europe/Stockholm',
    ...(process.env.PLAYWRIGHT_CHROME ? { channel: 'chrome' } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.PLAYWRIGHT_CHROME ? { channel: 'chrome' } : {}) } }],
  webServer: {
    command: `npx vite build --outDir e2e/.dist --emptyOutDir && npx vite preview --outDir e2e/.dist --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_API_BASE_URL: 'https://api.e2e.test', VITE_DEV_TENANT_SLUG: 'testkrogen', VITE_MENU_IMAGE_BASE_URL: 'https://cdn.e2e.test' },
  },
})
