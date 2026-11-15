import { test, expect, type Page } from '@playwright/test'
import { VIEWPORTS, fullAudit, layoutAudit, axeIssues, assertNoIssues, record, setTheme, STABLE_CSS, type Issue } from './lib/ui-audit'
import { uiApi } from './lib/ui-api'

/** Key guest-site interactions at phone (390) and desktop (1440), light and dark. */
const SIZES = VIEWPORTS.filter((v) => ['390', '1440'].includes(v.name))

for (const vp of SIZES) {
  for (const theme of ['light', 'dark'] as const) {
    const phone = vp.kind === 'phone'
    const open = async (page: Page, path: string) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setTheme(page, theme)
      await page.clock.setFixedTime(new Date('2026-11-14T10:00:00+01:00'))
      await uiApi(page)
      await page.goto(path)
      await page.waitForSelector('h1, h2')
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.addStyleTag({ content: STABLE_CSS })
      await page.waitForTimeout(500)
    }
    const finish = (info: Parameters<Parameters<typeof test>[2]>[1], name: string, issues: Issue[]) => {
      record(info, 'customer', 'interaction:' + name, vp.name, theme, issues)
      assertNoIssues(issues)
    }

    if (phone) {
      test(`mobile menu ${vp.name} ${theme}`, async ({ page }, info) => {
        await open(page, '/')
        const issues: Issue[] = []
        await page.getByRole('button', { name: 'Öppna meny' }).click()
        await page.waitForTimeout(400)
        const nav = page.getByRole('navigation', { name: 'Mobilmeny' })
        await expect(nav).toBeVisible()
        const b = await nav.boundingBox()
        if (!b || b.x < -1 || b.x + b.width > vp.width + 1) issues.push({ kind: 'drawer-bounds', severity: 'high', message: `Mobile menu outside the window: ${JSON.stringify(b)}` })
        issues.push(...(await layoutAudit(page, { phone, atBottom: false })).filter((i) => i.kind !== 'tap-target' && !(i.kind === 'covered' && !/site-header/.test(i.selector ?? ''))))
        issues.push(...(await axeIssues(page)))
        await page.screenshot({ path: info.outputPath('menu-open.png') })
        // the close button must stay usable while the drawer is open
        const closeBtn = page.getByRole('button', { name: 'Stäng meny' })
        const cb = await closeBtn.boundingBox()
        const hit = cb ? await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.closest('button')?.getAttribute('aria-label') ?? e?.tagName ?? null }, { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }) : null
        if (hit !== 'Stäng meny') issues.push({ kind: 'drawer-close-covered', severity: 'high', message: `The close button of the mobile menu is covered by the open drawer (a tap hits ${hit}); only Escape or a tap outside closes it`, selector: 'button.site-header-burger--open' })
        await page.keyboard.press('Escape')
        if (await page.locator('.mobile-drawer--open').count()) await page.mouse.click(10, 400)
        if (await page.locator('.mobile-drawer--open').count()) issues.push({ kind: 'drawer-no-close', severity: 'high', message: 'The mobile menu cannot be closed with Escape or a tap outside' })
        finish(info, 'mobile-menu', issues)
      })

      test(`mobile menu scrolled ${vp.name} ${theme} @x`, async ({ page }, info) => {
        // opening the menu mid-page must keep the header (close, name, theme) on screen
        await open(page, '/meny')
        const issues: Issue[] = []
        await page.evaluate(() => window.scrollTo(0, 600))
        await page.waitForTimeout(300)
        await page.getByRole('button', { name: 'Öppna meny' }).click()
        await page.waitForTimeout(400)
        await expect(page.getByRole('navigation', { name: 'Mobilmeny' })).toBeVisible()
        const headerTop = await page.evaluate(() => document.querySelector('.site-header')?.getBoundingClientRect().top ?? null)
        if (headerTop === null || Math.abs(headerTop) > 1) issues.push({ kind: 'drawer-header-gone', severity: 'high', message: `With the page scrolled, the header leaves the screen when the menu opens (top ${headerTop})`, selector: '.site-header' })
        const closeBtn = page.getByRole('button', { name: 'Stäng meny' })
        const cb = await closeBtn.boundingBox()
        const hit = cb ? await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.closest('button')?.getAttribute('aria-label') ?? e?.tagName ?? null }, { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }) : null
        if (hit !== 'Stäng meny') issues.push({ kind: 'drawer-close-covered', severity: 'high', message: `With the page scrolled, the close button of the open menu cannot be tapped (a tap hits ${hit})`, selector: 'button.site-header-burger--open' })
        await page.screenshot({ path: info.outputPath('menu-open-scrolled.png') })
        await closeBtn.click()
        await page.waitForTimeout(400)
        if (await page.locator('.mobile-drawer--open').count()) issues.push({ kind: 'drawer-no-close', severity: 'high', message: 'With the page scrolled, the close button does not close the menu' })
        const y = await page.evaluate(() => window.scrollY)
        if (Math.abs(y - 600) > 2) issues.push({ kind: 'drawer-scroll-jump', severity: 'medium', message: `Closing the menu moved the page from 600 to ${y}` })
        finish(info, 'mobile-menu-scrolled', issues)
      })
    }

    test(`theme toggle ${vp.name} ${theme}`, async ({ page }, info) => {
      await open(page, '/')
      const issues: Issue[] = []
      const toggleAny = page.getByRole('button', { name: /byt till|switch/i })
      if (phone && !(await toggleAny.filter({ visible: true }).count())) await page.getByRole('button', { name: 'Öppna meny' }).click().catch(() => {})
      const toggle = page.getByRole('button', { name: /byt till|switch/i }).filter({ visible: true }).first()
      if (!(await toggle.count())) issues.push({ kind: 'theme-toggle', severity: 'high', message: phone ? 'No theme toggle reachable on a phone (not in the header, not in the open menu)' : 'No visible theme toggle' })
      else {
        await toggle.click()
        await page.waitForTimeout(800)
        const want = theme === 'light' ? 'dark' : 'light'
        const got = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), ls: localStorage.getItem('booqy-theme') }))
        if (got.attr !== want) issues.push({ kind: 'theme-toggle', severity: 'high', message: `data-theme is ${got.attr} after toggle, expected ${want}` })
        if (got.ls !== want) issues.push({ kind: 'theme-toggle', severity: 'medium', message: `booqy-theme is ${got.ls}, expected ${want}` })
      }
      finish(info, 'theme-toggle', issues)
    })

    test(`order: add dish with options and open the cart ${vp.name} ${theme}`, async ({ page }, info) => {
      await open(page, '/bestall')
      const issues: Issue[] = []
      const add = page.getByRole('button', { name: /Lägg till/ }).first()
      await add.scrollIntoViewIfNeeded()
      await add.click()
      await page.waitForTimeout(500)
      if (await page.getByRole('dialog').count()) {
        const dlg = page.getByRole('dialog').first()
        const b = await dlg.boundingBox()
        if (b && b.width < vp.width - 4 && Math.abs(b.x + b.width / 2 - vp.width / 2) > 6) issues.push({ kind: 'modal-centre', severity: 'medium', message: 'Option dialog is not horizontally centred' })
        issues.push(...(await layoutAudit(page, { phone, atBottom: false })).filter((i) => i.kind !== 'tap-target'))
        issues.push(...(await axeIssues(page)))
        await page.screenshot({ path: info.outputPath('options.png') })
        await dlg.getByRole('button', { name: /^Lägg till/ }).click().catch(() => {})
        await page.waitForTimeout(500)
      }
      issues.push(...(await fullAudit(page, { phone })).filter((i) => i.kind !== 'tap-target'))
      await page.screenshot({ path: info.outputPath('cart.png') })
      finish(info, 'order-cart', issues)
    })

    test(`dropdown: party size in the site look, picked by keyboard ${vp.name} ${theme} @x`, async ({ page }, info) => {
      await open(page, '/boka-bord')
      const issues: Issue[] = []
      const box = page.getByRole('combobox', { name: 'Antal personer' })
      await box.scrollIntoViewIfNeeded()
      await box.click()
      const list = page.getByRole('listbox', { name: 'Antal personer' })
      await expect(list).toBeVisible()
      await page.waitForTimeout(300)
      // the whole popup box (list plus its padding and border), not only the listbox
      const popBox = page.locator('.combo-pop')
      const fits = async (label: string) => {
        const b = await popBox.boundingBox()
        const t = await box.boundingBox()
        if (!b || b.x < -1 || b.x + b.width > vp.width + 1 || b.y < -1 || b.y + b.height > vp.height + 1) issues.push({ kind: 'dropdown-bounds', severity: 'high', message: `${label}: dropdown outside the window: ${JSON.stringify(b)}` })
        else if (!phone && t && b.y < t.y + t.height - 1 && b.y + b.height > t.y + 1) issues.push({ kind: 'dropdown-overlap', severity: 'high', message: `${label}: dropdown covers its trigger: ${JSON.stringify({ pop: b, trigger: t })}` })
      }
      await fits('Opened')
      if (phone) {
        const before = await page.evaluate(() => window.scrollY)
        await page.mouse.move(vp.width / 2, 40)
        await page.mouse.wheel(0, 400)
        await page.waitForTimeout(300)
        const after = await page.evaluate(() => window.scrollY)
        if (Math.abs(after - before) > 1) issues.push({ kind: 'dropdown-scroll-behind', severity: 'medium', message: `The page scrolled behind the open sheet (${before} to ${after})` })
      }
      const sheet = await page.locator('.combo-pop--sheet').count()
      if (phone !== Boolean(sheet)) issues.push({ kind: 'dropdown-mode', severity: 'high', message: phone ? 'No bottom sheet on a phone' : 'A bottom sheet on a wide screen' })
      issues.push(...(await axeIssues(page)))
      await page.screenshot({ path: info.outputPath('dropdown.png') })
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(list).toBeHidden()
      if (!/3 personer/.test((await box.textContent()) ?? '')) issues.push({ kind: 'dropdown-keyboard', severity: 'high', message: 'ArrowDown + Enter did not pick the next party size' })
      await box.click()
      await page.keyboard.press('Escape')
      await expect(list).toBeHidden()
      if (!(await box.evaluate((el) => el === document.activeElement))) issues.push({ kind: 'dropdown-focus', severity: 'medium', message: 'Escape did not leave focus on the dropdown' })
      if (!phone) {
        // trigger near the bottom of the window: the list flips above and keeps its gap
        await box.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().bottom - window.innerHeight + 60))
        await page.waitForTimeout(200)
        const t = await box.boundingBox()
        if (t && t.y + t.height > vp.height - 200) {
          await box.click()
          await expect(list).toBeVisible()
          await page.waitForTimeout(300)
          if (!(await page.locator('.combo-pop--above').count())) issues.push({ kind: 'dropdown-flip', severity: 'medium', message: 'With no room below, the dropdown did not open above' })
          await fits('Flipped')
          await page.keyboard.press('Escape')
        }
      }
      finish(info, 'dropdown', issues)
    })

    test(`booking: pick a time and reach the details step ${vp.name} ${theme}`, async ({ page }, info) => {
      await open(page, '/boka-bord')
      const issues: Issue[] = []
      await page.getByRole('button', { name: /^17:30/ }).first().click().catch(() => {})
      await page.waitForTimeout(600)
      issues.push(...(await fullAudit(page, { phone })).filter((i) => i.kind !== 'tap-target'))
      issues.push(...(await axeIssues(page)))
      await page.screenshot({ path: info.outputPath('booking.png'), fullPage: true })
      finish(info, 'booking-step', issues)
    })
  }
}
