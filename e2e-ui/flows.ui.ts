import { test, expect, type Page } from '@playwright/test'
import { VIEWPORTS, axeIssues, assertNoIssues, record, setTheme, type Issue } from './lib/ui-audit'
import { uiApi } from './lib/ui-api'

/**
 * Catering and gift card flows with the real motion on (reducedMotion:
 * no-preference): the cards keep their drop-in animation, which once moved
 * the fixed calendar far away from its field. Short phone, phone, tablet and
 * desktop, light and dark.
 */
const SIZES = VIEWPORTS.filter((v) => ['375', '390', '820p', '1440'].includes(v.name))
const CROSS = ['390', '820p', '1440']

test.use({ reducedMotion: 'no-preference' })

for (const vp of SIZES) {
  for (const theme of ['light', 'dark'] as const) {
    const tag = CROSS.includes(vp.name) ? ' @x' : ''
    const open = async (page: Page, path: string) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setTheme(page, theme)
      await page.clock.setFixedTime(new Date('2026-11-14T10:00:00+01:00'))
      await uiApi(page)
      await page.goto(path)
      await page.waitForSelector('h1')
      await page.waitForLoadState('networkidle').catch(() => {})
    }

    test(`catering: calendar opens next to its field ${vp.name} ${theme}${tag}`, async ({ page }, info) => {
      await open(page, '/catering')
      const issues: Issue[] = []
      await page.getByLabel('Antal gäster').fill('20')
      await page.getByLabel('Gäster Buffé Roma').fill('20')
      const details = page.getByRole('region', { name: 'När och var' })
      await expect(details).toBeVisible()
      const button = details.getByRole('button', { name: 'Öppna kalender' })
      await button.scrollIntoViewIfNeeded()
      await page.waitForTimeout(800) // the card's drop-in animation runs to the end
      await button.click()
      const cal = page.getByRole('dialog', { name: 'Välj datum' })
      await expect(cal).toBeVisible()
      await page.waitForTimeout(200)
      const field = await details.locator('.date-input').boundingBox()
      const box = await cal.boundingBox()
      if (!field || !box) issues.push({ kind: 'calendar-missing', severity: 'high', message: 'Calendar or date field has no box' })
      else {
        const below = Math.abs(box.y - (field.y + field.height)) <= 8
        const above = Math.abs(box.y + box.height - field.y) <= 8
        if (!below && !above) issues.push({ kind: 'calendar-detached', severity: 'high', message: `Calendar is not next to its field: ${JSON.stringify({ field, box })}` })
        if (box.x < 0 || box.y < 0 || box.x + box.width > vp.width || box.y + box.height > vp.height) issues.push({ kind: 'calendar-bounds', severity: 'high', message: `Calendar outside the window: ${JSON.stringify(box)}` })
        const leftOk = Math.abs(box.x - field.x) <= 8 || box.x + box.width >= vp.width - 9
        if (!leftOk) issues.push({ kind: 'calendar-left', severity: 'medium', message: `Calendar left edge ${box.x} vs field ${field.x}` })
      }
      const alpha = await cal.evaluate((el) => {
        const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor)
        const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean) : []
        return parts.length > 3 ? Number(parts[3]) : 1
      })
      if (alpha < 0.95) issues.push({ kind: 'calendar-see-through', severity: 'medium', message: `Calendar background alpha ${alpha}` })
      issues.push(...(await axeIssues(page)))
      await page.screenshot({ path: info.outputPath('calendar.png') })
      // picking a day closes it and fills the field; the time field next to it stays usable
      await cal.locator('.date-cal-day:not(:disabled)').first().click()
      await expect(cal).toBeHidden()
      await expect(details.locator('.date-input input')).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/)
      const time = details.getByLabel('Tid')
      await time.fill('1130')
      await time.blur()
      await expect(time).toHaveValue('11:30')
      record(info, 'customer', 'flow:catering-calendar', vp.name, theme, issues)
      assertNoIssues(issues)
    })

    test(`gift card: amount bar fits, custom amount and e-mail errors ${vp.name} ${theme}${tag}`, async ({ page }, info) => {
      await open(page, '/presentkort')
      const issues: Issue[] = []
      const bar = page.getByRole('tablist', { name: 'Välj belopp' })
      await expect(bar).toBeVisible()
      await page.waitForTimeout(800)
      const b = await bar.boundingBox()
      const form = await page.locator('.presentkort-page form').boundingBox()
      for (const tab of await bar.getByRole('tab').all()) {
        const t = await tab.boundingBox()
        const name = await tab.textContent()
        if (!b || !t || t.x < b.x - 1 || t.x + t.width > b.x + b.width + 1 || t.y + t.height > b.y + b.height + 1) issues.push({ kind: 'tab-clipped', severity: 'high', message: `Amount "${name}" sticks out of the bar: ${JSON.stringify({ bar: b, tab: t })}` })
      }
      if (b && form && b.x + b.width > form.x + form.width + 1) issues.push({ kind: 'bar-overflow', severity: 'high', message: 'Amount bar is wider than the form' })
      await expect(page.getByLabel(/^Belopp/)).toHaveCount(0)
      await page.getByRole('button', { name: 'Till betalning, 300 kr' }).click()
      await expect(page.getByText('Fyll i din e-post.')).toBeVisible()
      await expect(page.getByLabel(/Din e-post/)).toBeFocused()
      await bar.getByRole('tab', { name: 'Eget belopp' }).click()
      await expect(page.getByLabel(/^Belopp/)).toBeVisible()
      await page.getByLabel(/Din e-post/).fill('kopare@example.se')
      await page.getByRole('button', { name: 'Till betalning' }).click()
      await expect(page.getByText('Välj ett belopp mellan 100 och 5000 kr.')).toBeVisible()
      issues.push(...(await axeIssues(page)))
      await page.screenshot({ path: info.outputPath('presentkort.png') })
      record(info, 'customer', 'flow:presentkort', vp.name, theme, issues)
      assertNoIssues(issues)
    })
  }
}
