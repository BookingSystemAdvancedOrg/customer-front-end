import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { API, CDN, EVENT, EVENT_ID, IMAGE_ALT, IMAGE_KEY, TICKET_TOKEN, fakeApi } from './fakeApi'

/**
 * Evenemangsbilder (K15/K16) och Wallet-knapparna på /biljett (K18/K19).
 * Med SCREENSHOTS=1 skrivs även skärmbilderna, ljust och mörkt, mobil (390)
 * och dator (1280), till docs/screenshots/run-2d-k-media/customer-front-end/.
 */
const OUT = 'docs/screenshots/run-2d-k-media/customer-front-end'

test.describe('Evenemangsbilder och Wallet', () => {
  test('the list and the event page show the event image with its alt text', async ({ page }) => {
    await fakeApi(page, { images: true })
    await page.goto('/evenemang')
    const card = page.getByRole('img', { name: IMAGE_ALT })
    await expect(card).toBeVisible()
    expect(await card.getAttribute('src')).toBe(`${CDN}/${IMAGE_KEY}`)
    expect(await card.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    // Bara evenemanget med bild har en bild; kortet går fortfarande att öppna.
    await expect(page.locator('.evenemang-item__img')).toHaveCount(1)
    await page.getByRole('link', { name: EVENT.title }).click()
    await expect(page.getByRole('heading', { level: 1, name: EVENT.title })).toBeVisible()
    await expect(page.getByRole('img', { name: IMAGE_ALT })).toBeVisible()
  })

  test('no image without one from the API', async ({ page }) => {
    await fakeApi(page)
    await page.goto(`/evenemang/${EVENT_ID}`)
    await expect(page.getByRole('heading', { level: 1, name: EVENT.title })).toBeVisible()
    await expect(page.locator('.evenemang-hero-img')).toHaveCount(0)
  })

  test('the Wallet buttons appear only when the API says Wallet is available and link the ticket pass', async ({ page }) => {
    await fakeApi(page)
    await page.goto(`/biljett#${TICKET_TOKEN}`)
    await expect(page.getByRole('img', { name: /QR-kod/ })).toBeVisible()
    await expect(page.getByText(/Wallet/)).toHaveCount(0)

    await fakeApi(page, { wallet: true })
    await page.reload()
    const apple = page.getByRole('link', { name: 'Lägg till i Apple Wallet: Vinprovning (1 av 2)' })
    const google = page.getByRole('link', { name: 'Lägg till i Google Wallet: Vinprovning (1 av 2)' })
    await expect(apple).toBeVisible()
    await expect(google).toBeVisible()
    expect(await apple.getAttribute('href')).toBe(`${API}/public/tickets/${TICKET_TOKEN}/pass?ticketId=01JTICKET0000000000000001&kind=apple`)
    expect(await google.getAttribute('href')).toBe(`${API}/public/tickets/${TICKET_TOKEN}/pass?ticketId=01JTICKET0000000000000001&kind=google`)
    // Den insläppta biljetten får inga knappar.
    await expect(page.getByRole('link', { name: /Wallet/ })).toHaveCount(2)
    // Tangentbord: knapparna nås med Tab och har en synlig fokusmarkering.
    await apple.focus()
    await expect(apple).toBeFocused()
    const ring = await apple.evaluate((el) => getComputedStyle(el).boxShadow + getComputedStyle(el).outlineStyle)
    expect(ring).not.toBe('nonenone')
    await page.keyboard.press('Tab')
    await expect(google).toBeFocused()
  })
})

const SIZES = [
  { device: 'mobile', width: 390, height: 844 },
  { device: 'desktop', width: 1280, height: 900 },
] as const
const THEMES = ['light', 'dark'] as const
const SCREENS: { name: string; go: (page: Page) => Promise<void> }[] = [
  { name: 'evenemang-bild', go: async (p) => {
    await p.goto('/evenemang')
    await expect(p.getByRole('img', { name: IMAGE_ALT })).toBeVisible()
  } },
  { name: 'evenemang-detalj-bild', go: async (p) => {
    await p.goto(`/evenemang/${EVENT_ID}`)
    await expect(p.getByRole('img', { name: IMAGE_ALT })).toBeVisible()
  } },
  { name: 'biljett-wallet', go: async (p) => {
    await p.goto(`/biljett#${TICKET_TOKEN}`)
    await expect(p.getByRole('link', { name: /Apple Wallet/ })).toBeVisible()
  } },
]

test.describe('skärmbilder (bild och Wallet)', () => {
  test.skip(!process.env.SCREENSHOTS, 'SCREENSHOTS=1 för att skriva skärmbilderna')
  for (const screen of SCREENS) {
    for (const theme of THEMES) {
      for (const size of SIZES) {
        test(`${screen.name} ${theme} ${size.device}`, async ({ page }) => {
          await page.setViewportSize({ width: size.width, height: size.height })
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
          await fakeApi(page, { images: true, wallet: true })
          await screen.go(page)
          await page.evaluate(() => document.fonts.ready)
          await page.evaluate(() => window.scrollTo(0, 0))
          await page.waitForTimeout(300)
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
          // Ingen sidled scroll på mobilen.
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
          await page.screenshot({ path: `${OUT}/${screen.name}-${theme}-${size.device}-${size.width}.png`, fullPage: true, animations: 'disabled' })
        })
      }
    }
  }
})
