import { expect, test } from '@playwright/test'
import { fakeApi } from './fakeApi'

/**
 * En gammal QR-kod från ett bord (/bestall?bord=<kod>): beställning och
 * betalning vid bordet finns inte längre, så gästen får "Beställ och betala i
 * kassan" med länkar till menyn och bokningen, utan beställningsformulär.
 * fakeApi har ingen beställning i planen, så sidan finns även utan den.
 */
test('an old table QR code lands on the counter page, with no order form', async ({ page }) => {
  await fakeApi(page)
  await page.goto('/bestall?bord=old-code')
  await expect(page.getByRole('heading', { level: 1, name: 'Beställ och betala i kassan' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Se menyn' })).toHaveAttribute('href', '/meny')
  await expect(page.getByRole('main').getByRole('link', { name: 'Boka bord' })).toHaveAttribute('href', '/boka-bord')
  await expect(page.getByRole('button', { name: /Lägg till/ })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page).toHaveTitle('Beställ i kassan - Testkrogen')
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(scroll).toBeLessThanOrEqual(0)
})
