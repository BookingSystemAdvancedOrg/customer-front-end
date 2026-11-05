import { expect, test } from '@playwright/test'
import { EVENT, EVENT_ID, GIFT_TOKEN, LOCATION_ID, OCC_1, TICKET_TOKEN, fakeApi } from './fakeApi'

test.describe('Evenemang och biljetter på restaurangens sajt', () => {
  test('a guest buys two tickets end to end: list, date, types, hold, pay, thank-you', async ({ page }) => {
    const api = await fakeApi(page)
    await page.goto('/evenemang')
    await expect(page.getByRole('heading', { level: 1, name: 'Evenemang' })).toBeVisible()
    await expect(page.getByText('Slutsålt')).toBeVisible()
    await page.getByRole('link', { name: EVENT.title }).click()
    await expect(page).toHaveURL(new RegExp(`/evenemang/${EVENT_ID}$`))
    await expect(page.getByRole('heading', { level: 1, name: EVENT.title })).toBeVisible()

    const dates = page.getByRole('radio')
    await expect(dates.first()).toBeChecked()
    await expect(dates.nth(1)).toBeDisabled()
    await page.getByRole('button', { name: 'En Vinprovning till' }).click()
    await page.getByRole('button', { name: 'En Vinprovning till' }).click()
    await expect(page.getByText('Totalt 900 kr')).toBeVisible()
    await page.getByLabel('Namn').fill('Sara Ek')
    await page.getByLabel('E-post').fill('sara@example.se')
    await page.getByRole('button', { name: 'Till betalning, 900 kr' }).click()

    await expect(page.getByRole('heading', { name: 'Betala' })).toBeVisible()
    await expect(page.getByText(/Platserna hålls till kl\. 16:15/)).toBeVisible()
    expect(api.checkouts).toHaveLength(1)
    expect(api.checkouts[0]).toMatchObject({
      occurrenceId: OCC_1, lines: [{ typeId: 'VUXEN000001', qty: 2 }], buyerName: 'Sara Ek', buyerEmail: 'sara@example.se',
    })
    expect(String(api.checkouts[0].orderId)).toMatch(/^[0-9a-f]{32}$/)
    await expect(page.getByTestId('fake-stripe')).toBeVisible()
    await page.getByRole('button', { name: 'Betala 900 kr' }).click()

    await expect(page.getByRole('heading', { name: 'Tack för köpet!' })).toBeVisible()
    await expect(page.getByText(/De 2 biljetterna till Vinprovning: Rhônedalen är betalda \(900 kr\)/)).toBeVisible()
    // Inga cookies, och bara den registrerade nyckeln i sessionStorage (den tas bort efter tack-sidan).
    expect(await page.context().cookies()).toEqual([])
  })

  test('a free event issues the tickets at once without a card payment', async ({ page }) => {
    const api = await fakeApi(page, { free: true })
    await page.goto(`/evenemang/${EVENT_ID}`)
    await page.getByRole('button', { name: 'En Fri entré till' }).click()
    await page.getByLabel('Namn').fill('Sara Ek')
    await page.getByLabel('E-post').fill('sara@example.se')
    await page.getByRole('button', { name: 'Hämta biljetterna' }).click()
    await expect(page.getByRole('heading', { name: 'Klart!' })).toBeVisible()
    expect(api.checkouts).toHaveLength(1)
    // Ingen kortbetalning: betalfältet monteras aldrig.
    await expect(page.getByTestId('fake-stripe')).toHaveCount(0)
  })

  test('the purchase form works with the keyboard alone', async ({ page }) => {
    await fakeApi(page)
    await page.goto(`/evenemang/${EVENT_ID}`)
    await page.getByRole('radio').first().focus()
    await expect(page.getByRole('radio').first()).toBeFocused()
    const more = page.getByRole('button', { name: 'En Vinprovning till' })
    await more.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(page.getByLabel('Antal Vinprovning')).toHaveText('2')
    await page.getByLabel('Namn').focus()
    await page.keyboard.type('Sara Ek')
    await page.keyboard.press('Tab')
    await page.keyboard.type('sara@example.se')
    await expect(page.getByLabel('E-post')).toHaveValue('sara@example.se')
    const submit = page.getByRole('button', { name: 'Till betalning, 900 kr' })
    await submit.focus()
    // Synlig fokusmarkering (brandens fokusring) på knappen.
    const ring = await submit.evaluate((el) => getComputedStyle(el).boxShadow + getComputedStyle(el).outlineStyle)
    expect(ring).not.toBe('nonenone')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Betala' })).toBeVisible()
  })

  test('the ticket page shows the QR per ticket and gives a ticket away and back', async ({ page }) => {
    const api = await fakeApi(page)
    await page.goto(`/biljett#${TICKET_TOKEN}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Dina biljetter' })).toBeVisible()
    const qr = page.getByRole('img', { name: 'QR-kod för Vinprovning (1 av 2)' })
    await expect(qr).toBeVisible()
    expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    await expect(page.getByText('01JTICKET0000000000000001.9f2c4e1a7b3d5c60')).toBeVisible()
    await expect(page.getByText('Giltig', { exact: true })).toBeVisible()
    await expect(page.getByText('Insläppt', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Ge bort biljetten' }).click()
    await page.getByLabel('Mottagarens e-post').fill('van@example.se')
    await page.getByRole('button', { name: 'Skicka biljetten' }).click()
    await expect(page.getByText(/på väg till mottagaren/)).toBeVisible()
    expect(api.transfers[0]).toMatchObject({ kind: 'gift', ticketId: '01JTICKET0000000000000001', toEmail: 'van@example.se' })
    await page.getByRole('button', { name: 'Ångra gåvan' }).click()
    await expect(page.getByRole('button', { name: 'Ge bort biljetten' })).toBeVisible()
    expect(api.cancelled).toEqual(['tr0000000000000000000000000000001'])
  })

  test('a received gift is accepted with a name and opens the ticket page', async ({ page }) => {
    const api = await fakeApi(page)
    await page.goto(`/biljett/ta-emot#${GIFT_TOKEN}`)
    await page.getByLabel('Ditt namn').fill('Vân Nguyen')
    await page.getByRole('button', { name: 'Ta emot biljetten' }).click()
    await expect(page).toHaveURL(new RegExp(`/biljett#${TICKET_TOKEN.replace('.', '\\.')}$`))
    await expect(page.getByRole('img', { name: /QR-kod/ })).toBeVisible()
    expect(api.accepted).toEqual([{ name: 'Vân Nguyen' }])
  })

  test('shows nothing when the events entitlement is off', async ({ page }) => {
    const calls: string[] = []
    page.on('request', (r) => { if (r.url().includes('/events') || r.url().includes('/tickets')) calls.push(r.url()) })
    await fakeApi(page, { events: false })
    for (const path of ['/evenemang', `/evenemang/${EVENT_ID}`, `/biljett#${TICKET_TOKEN}`, '/biljett/ta-emot']) {
      await page.goto(path)
      await expect(page.getByRole('link', { name: 'Testkrogen - startsida' })).toBeVisible()
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByRole('heading', { name: /^(Evenemang|Dina biljetter|Ta emot biljett)$/ })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Evenemang' })).toHaveCount(0)
    }
    expect(calls.filter((u) => u.includes(`/public/locations/${LOCATION_ID}/events`) || u.includes('/public/tickets'))).toEqual([])
  })
})
