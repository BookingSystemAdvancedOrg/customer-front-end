import { test, expect } from '@playwright/test'
import { VIEWPORTS, CROSS_BROWSER, VISUAL, fullAudit, axeIssues, focusIssues, assertNoIssues, record, setTheme, STABLE_CSS, type Issue } from './lib/ui-audit'
import { uiApi, EVENT, TICKET_TOKEN, TABLE_ORDER_ID, TABLE_BILL_ID } from './lib/ui-api'

/** Every guest-site route x every screen size x light/dark. */
export const PAGES: { name: string; path: string }[] = [
  { name: 'start', path: '/' },
  { name: 'meny', path: '/meny' },
  { name: 'boka-bord', path: '/boka-bord' },
  { name: 'bokningsvillkor', path: '/bokningsvillkor' },
  { name: 'bestall', path: '/bestall' },
  { name: 'bestall-bord', path: '/bestall?bord=code-7' },
  { name: 'bestallning-bord', path: `/bestallning/loc-1/${TABLE_ORDER_ID}#order-tok` },
  { name: 'notan', path: '/notan/loc-1#L.payload.sig' },
  { name: 'notan-betald', path: `/notan/loc-1?nota=${TABLE_BILL_ID}#bill-tok` },
  { name: 'catering', path: '/catering' },
  { name: 'om-oss', path: '/om-oss' },
  { name: 'kontakt', path: '/kontakt' },
  { name: 'integritetspolicy', path: '/integritetspolicy' },
  { name: 'cookies', path: '/cookies' },
  { name: 'presentkort', path: '/presentkort' },
  { name: 'presentkort-saldo', path: '/presentkort/saldo' },
  { name: 'ko', path: '/ko' },
  { name: 'evenemang', path: '/evenemang' },
  { name: 'evenemang-detalj', path: `/evenemang/${EVENT.eventId ?? '01JEVENTVINPROVNING0000001'}` },
  { name: 'biljett', path: `/biljett#${TICKET_TOKEN}` },
  { name: 'okand-sida', path: '/finns-inte' },
]

for (const pg of PAGES) {
  test.describe(pg.name, () => {
    for (const vp of VIEWPORTS) {
      for (const theme of ['light', 'dark'] as const) {
        const tag = CROSS_BROWSER.includes(vp.name) ? ' @x' : ''
        test(`${pg.name} ${vp.name} ${theme}${tag}`, async ({ page }, info) => {
          await page.setViewportSize({ width: vp.width, height: vp.height })
          await setTheme(page, theme)
          await page.clock.setFixedTime(new Date('2026-11-14T10:00:00+01:00'))
          await uiApi(page)
          await page.goto(pg.path)
          await page.waitForSelector('h1, h2, main', { timeout: 20000 })
          await page.waitForLoadState('networkidle').catch(() => {})
          await page.waitForTimeout(600)
          await page.addStyleTag({ content: STABLE_CSS })
          const issues: Issue[] = []
          const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
          if (dataTheme && dataTheme !== theme) issues.push({ kind: 'theme', severity: 'high', message: `data-theme is ${dataTheme}, expected ${theme}` })
          issues.push(...(await fullAudit(page, { phone: vp.kind === 'phone', helpSelector: '.help-launcher' })))
          issues.push(...(await axeIssues(page)))
          if (info.project.name === 'chromium') issues.push(...(await focusIssues(page)))
          let shot: string | undefined
          if (info.project.name === 'chromium' && VISUAL.includes(vp.name)) {
            try {
              await expect(page).toHaveScreenshot(`${pg.name}-${vp.name}-${theme}.png`, { mask: [page.locator('time, [data-dynamic]')] })
            } catch (e) {
              issues.push({ kind: 'visual', severity: 'medium', message: 'Differs from baseline: ' + String((e as Error).message).split('\n')[0] })
            }
            shot = 'visual'
          }
          record(info, 'customer', pg.name, vp.name, theme, issues, { shot })
          assertNoIssues(issues.filter((i) => i.kind !== 'visual'))
          expect.soft(issues.filter((i) => i.kind === 'visual'), 'visual baseline').toEqual([])
        })
      }
    }
  })
}
