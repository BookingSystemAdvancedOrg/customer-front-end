import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { EVENT_ID, GIFT_TOKEN, TICKET_TOKEN, fakeApi } from './fakeApi'

/**
 * Skärmbilder av de nya sidorna, ljust och mörkt, mobil (390) och dator
 * (1280), till docs/screenshots/run-2d-k/customer-front-end/. Körs bara med
 * SCREENSHOTS=1 så att vanliga e2e-körningar inte skriver om filerna.
 */
const OUT = 'docs/screenshots/run-2d-k/customer-front-end'
const SIZES = [
  { device: 'mobile', width: 390, height: 844 },
  { device: 'desktop', width: 1280, height: 900 },
] as const
const THEMES = ['light', 'dark'] as const

async function toPay(page: Page) {
  await page.goto(`/evenemang/${EVENT_ID}`)
  await page.getByRole('button', { name: 'En Vinprovning till' }).click()
  await page.getByRole('button', { name: 'En Vinprovning till' }).click()
  await page.getByLabel('Namn').fill('Sara Ek')
  await page.getByLabel('E-post').fill('sara@example.se')
}

const SCREENS: { name: string; free?: boolean; go: (page: Page) => Promise<void> }[] = [
  { name: 'evenemang', go: async (p) => { await p.goto('/evenemang'); await expect(p.getByText('Slutsålt')).toBeVisible() } },
  { name: 'evenemang-detalj', go: async (p) => { await toPay(p) } },
  { name: 'evenemang-betalning', go: async (p) => {
    await toPay(p)
    await p.getByRole('button', { name: 'Till betalning, 900 kr' }).click()
    await expect(p.getByTestId('fake-stripe')).toBeVisible()
  } },
  { name: 'evenemang-tack', go: async (p) => {
    await toPay(p)
    await p.getByRole('button', { name: 'Till betalning, 900 kr' }).click()
    await p.getByRole('button', { name: 'Betala 900 kr' }).click()
    await expect(p.getByRole('heading', { name: 'Tack för köpet!' })).toBeVisible()
  } },
  { name: 'biljett', go: async (p) => {
    await p.goto(`/biljett#${TICKET_TOKEN}`)
    await expect(p.getByRole('img', { name: /QR-kod/ })).toBeVisible()
  } },
  { name: 'biljett-ge-bort', go: async (p) => {
    await p.goto(`/biljett#${TICKET_TOKEN}`)
    await p.getByRole('button', { name: 'Ge bort biljetten' }).click()
    await p.getByLabel('Mottagarens e-post').fill('van@example.se')
  } },
  { name: 'biljett-ta-emot', go: async (p) => { await p.goto(`/biljett/ta-emot#${GIFT_TOKEN}`); await p.getByLabel('Ditt namn').fill('Vân Nguyen') } },
]

test.describe('skärmbilder', () => {
  test.skip(!process.env.SCREENSHOTS, 'SCREENSHOTS=1 för att skriva skärmbilderna')
  for (const screen of SCREENS) {
    for (const theme of THEMES) {
      for (const size of SIZES) {
        test(`${screen.name} ${theme} ${size.device}`, async ({ page }) => {
          await page.setViewportSize({ width: size.width, height: size.height })
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
          await fakeApi(page, { free: screen.free })
          await screen.go(page)
          await page.evaluate(() => document.fonts.ready)
          // Överst, så att den fasta menyn inte hamnar mitt i helsidesbilden.
          await page.evaluate(() => window.scrollTo(0, 0))
          await page.waitForTimeout(300)
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
          await page.screenshot({ path: `${OUT}/${screen.name}-${theme}-${size.device}-${size.width}.png`, fullPage: true, animations: 'disabled' })
        })
      }
    }
  }
})
