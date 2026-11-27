import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteProvider } from '@booqy/site-kit'
import { json, siteConfig } from '@booqy/site-kit/testing'
import App from '../App'

/*
 * jsdom has no layout, so each header part gets a fake natural width from its
 * text (8 px a letter) and the row a width set per test. The ResizeObserver
 * is a stub the test fires by hand, like a window resize.
 */
let rowWidth = 0
const observers: Array<() => void> = []

const textW = (el: Element) => (el.textContent ?? '').length * 8

function fakeWidth(el: Element): number {
  const c = el.classList
  if (c.contains('site-header-inner') || c.contains('site-header')) return rowWidth
  if (c.contains('site-header-wordmark')) return Math.min(textW(el), 300)
  if (c.contains('site-header-brand')) return fakeWidth(el.querySelector('.site-header-wordmark')!)
  if (el.matches('.site-header-nav ul')) return [...el.querySelectorAll('a')].reduce((w, a) => w + textW(a) + 28, 0)
  if (c.contains('open-chip-text')) return textW(el)
  if (c.contains('open-chip')) {
    const inFlow = el.querySelector(c.contains('open-chip--short') ? '.open-chip-text--short' : '.open-chip-text--full')!
    return 40 + textW(inFlow)
  }
  if (c.contains('site-header-tools')) return 120
  if (c.contains('site-header-burger')) return 44
  return 0
}

beforeEach(() => {
  rowWidth = 0
  observers.length = 0
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        observers.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { width: fakeWidth(this), height: 64, top: 0, left: 0, right: 0, bottom: 64, x: 0, y: 0 } as DOMRect
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return fakeWidth(this)
  })
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('site-header-wordmark')) return textW(this)
    return fakeWidth(this)
  })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

async function renderSite(name = 'Restaurant 1', locations = 1) {
  window.history.replaceState(null, '', '/?restaurang=testkrogen')
  const config = siteConfig({ name })
  for (let n = 2; n <= locations; n++) {
    config.locations.push({ ...config.locations[0], locationId: `loc-${n}`, name: `Plats ${n}` })
  }
  config.tenant.features = { ...config.tenant.features, giftCards: true, events: true }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/site-config') ? json(config) : json({ items: [] }))))
  render(
    <MemoryRouter>
      <SiteProvider>
        <App />
      </SiteProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('link', { name: `${name} - startsida` })
  return document.querySelector('.site-header') as HTMLElement
}

function resize(width: number) {
  rowWidth = width
  act(() => observers.forEach((cb) => cb()))
}

const burger = () => document.querySelector('.site-header-burger') as HTMLButtonElement
const nav = () => document.querySelector('.site-header-nav') as HTMLElement

describe('top bar fit', () => {
  it('shows every tab in the row when it fits, and hides the menu button', async () => {
    const header = await renderSite()
    resize(2400)
    expect(header.dataset.fit).toBe('0')
    expect(nav()).not.toHaveAttribute('aria-hidden')
    expect(within(nav()).getByRole('link', { name: 'Boka bord' })).toBeInTheDocument()
    expect(burger()).toHaveClass('site-header-off')
    expect(burger()).toHaveAttribute('inert')
    expect(screen.queryByRole('button', { name: 'Öppna meny' })).toBeNull()
  })

  it('moves the tabs behind the menu button when the row is too narrow, and back', async () => {
    const header = await renderSite()
    resize(2400)
    resize(700)
    expect(Number(header.dataset.fit)).toBeGreaterThanOrEqual(2)
    expect(nav()).toHaveClass('site-header-off')
    expect(nav()).toHaveAttribute('aria-hidden', 'true')
    expect(nav()).toHaveAttribute('inert')
    expect(screen.queryByRole('navigation', { name: 'Huvudmeny' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Öppna meny' })).toBeVisible()
    resize(2400)
    expect(header.dataset.fit).toBe('0')
  })

  it('never cuts the name below the minimum: a long name sends the tabs to the drawer first', async () => {
    const long = 'Restaurang Den Gyllene Hjorten och Vinbaren vid Stortorget'
    // the short name keeps every tab at this width ...
    expect((await renderSite()).dataset.fit).toBe('0')
    resize(800)
    expect(Number(document.querySelector<HTMLElement>('.site-header')!.dataset.fit)).toBeLessThan(2)
    cleanup()
    // ... the long one is cut only to the minimum, so the tabs move to the drawer
    const header = await renderSite(long)
    resize(800)
    expect(Number(header.dataset.fit)).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('link', { name: `${long} - startsida` })).toHaveAttribute('title', long)
  })

  it('shortens the status to Öppet/Stängt and keeps the full text for screen readers', async () => {
    const header = await renderSite()
    resize(2400)
    const chip = document.querySelector('.open-chip') as HTMLElement
    const navW = fakeWidth(nav().querySelector('ul')!)
    const brandW = fakeWidth(document.querySelector('.site-header-wordmark')!)
    const fullW = fakeWidth(chip)
    // room for everything but the long status
    resize(brandW + 1 + navW + 1 + fullW - 20 + 121)
    expect(header.dataset.fit).toBe('1')
    expect(chip).toHaveClass('open-chip--short')
    expect(chip.getAttribute('title')).toBeTruthy()
    expect(chip.textContent).toContain(chip.getAttribute('title')!)
  })

  it('puts the status, language and theme in the drawer on the narrowest rows', async () => {
    const header = await renderSite()
    resize(200)
    expect(header.dataset.fit).toBe('5')
    const tools = document.querySelector('.site-header-tools') as HTMLElement
    expect(tools).toHaveAttribute('inert')
    fireEvent.click(screen.getByRole('button', { name: 'Öppna meny' }))
    const drawer = document.getElementById('mobile-drawer')!
    expect(within(drawer).getByRole('combobox', { name: /Språk/ })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /byt till/ })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /Öppettider/ })).toBeInTheDocument()
  })

  it('drawer: every tab, aria-expanded, focus moves in, Tab is trapped, Escape closes and returns focus', async () => {
    await renderSite()
    resize(700)
    const button = screen.getByRole('button', { name: 'Öppna meny' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    const drawer = document.getElementById('mobile-drawer')!
    expect(drawer).toHaveAttribute('inert')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(drawer).not.toHaveAttribute('inert')
    const labels = within(drawer).getAllByRole('link').map((a) => a.textContent)
    const navLabels = [...nav().querySelectorAll('a')].map((a) => a.textContent)
    expect(labels).toEqual(navLabels)
    expect(labels).toContain('Boka bord')

    await act(() => new Promise((r) => setTimeout(r, 5)))
    expect(document.activeElement).toBe(within(drawer).getAllByRole('link')[0])

    // Tab from the last item in the drawer goes back to the close button
    const items = drawer.querySelectorAll<HTMLElement>('a[href], button')
    items[items.length - 1].focus()
    fireEvent.keyDown(items[items.length - 1], { key: 'Tab' })
    expect(document.activeElement).toBe(button)
    fireEvent.keyDown(button, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(items[items.length - 1])

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(button)
  })

  it('drawer: Tab from the menu button reaches the drawer even with a location picker after it', async () => {
    await renderSite('Restaurant 1', 2)
    resize(700)
    const button = screen.getByRole('button', { name: 'Öppna meny' })
    // the location picker is the next focusable element after the button in the page
    const picker = document.querySelector('.location-picker') as HTMLElement
    expect(picker.querySelector('button, [tabindex]:not([tabindex="-1"])')).toBeTruthy()
    fireEvent.click(button)
    const drawer = document.getElementById('mobile-drawer')!
    const links = within(drawer).getAllByRole('link')
    button.focus()
    fireEvent.keyDown(button, { key: 'Tab' })
    expect(document.activeElement).toBe(links[0])
    fireEvent.keyDown(links[0], { key: 'Tab' })
    expect(document.activeElement).toBe(links[1])
    fireEvent.keyDown(links[1], { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(links[0])
    fireEvent.keyDown(links[0], { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(button)
    // focus outside the list (e.g. on the picker) comes back to the button
    const pickerButton = picker.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')!
    pickerButton.focus()
    fireEvent.keyDown(pickerButton, { key: 'Tab' })
    expect(document.activeElement).toBe(button)
  })

  it('closes the drawer when the row grows and everything fits again', async () => {
    await renderSite()
    resize(700)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna meny' }))
    expect(document.getElementById('mobile-drawer')).toHaveClass('mobile-drawer--open')
    resize(2400)
    expect(document.getElementById('mobile-drawer')).not.toHaveClass('mobile-drawer--open')
  })
})
