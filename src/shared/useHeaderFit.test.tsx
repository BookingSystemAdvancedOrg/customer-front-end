import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHeaderFit } from './headerFit'

/*
 * The hook itself in jsdom: every part gets a stubbed width, the
 * ResizeObserver and document.fonts are stubs the test fires by hand.
 * Measured: brand 171 (min), nav navW + 1, short status 91, full 191,
 * tools 121, burger 36, gap 20. Level 1 needs 443 + nav, level 2 579.
 */
let rowWidth = 0
let navWidth: (level: number) => number = () => 640
const observers: Array<() => void> = []
let fonts: EventTarget & { ready: Promise<unknown> }

const level = (el: Element) => Number(el.closest('[data-fit]')?.getAttribute('data-fit') ?? 0)

const widths: Record<string, (el: Element) => number> = {
  brand: () => 170,
  word: () => 130,
  nav: (el) => navWidth(level(el)),
  chip: () => 190,
  full: () => 160,
  short: () => 60,
  tools: () => 120,
  burger: () => 36,
}

function Header({ contentKey = 'a' }: { contentKey?: string }) {
  const refs = {
    row: useRef<HTMLDivElement>(null),
    brand: useRef<HTMLAnchorElement>(null),
    wordmark: useRef<HTMLSpanElement>(null),
    navList: useRef<HTMLUListElement>(null),
    chip: useRef<HTMLSpanElement>(null),
    chipFull: useRef<HTMLSpanElement>(null),
    chipShort: useRef<HTMLSpanElement>(null),
    tools: useRef<HTMLDivElement>(null),
    burger: useRef<HTMLButtonElement>(null),
  }
  const fit = useHeaderFit(refs, contentKey)
  return (
    <div ref={refs.row} data-fit={fit} data-testid="row" style={{ columnGap: '20px' }}>
      <a ref={refs.brand} data-w="brand">
        <span ref={refs.wordmark} data-w="word">Krogen</span>
      </a>
      <ul ref={refs.navList} data-w="nav" />
      <span ref={refs.chip} data-w="chip">
        <span ref={refs.chipFull} data-w="full">Öppet till 22</span>
        <span ref={refs.chipShort} data-w="short">Öppet</span>
      </span>
      <div ref={refs.tools} data-w="tools" />
      <button ref={refs.burger} data-w="burger" />
    </div>
  )
}

const tick = () => act(() => observers.forEach((cb) => cb()))
const fitOf = (el: HTMLElement) => Number(el.getAttribute('data-fit'))

beforeEach(() => {
  rowWidth = 0
  navWidth = () => 640
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
    const w = widths[this.getAttribute('data-w') ?? '']?.(this) ?? 0
    return { width: w, height: 20, top: 0, left: 0, right: w, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('data-testid') === 'row' ? rowWidth : 0
  })
  fonts = Object.assign(new EventTarget(), { ready: new Promise(() => {}) })
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (document as unknown as { fonts?: unknown }).fonts
})

describe('useHeaderFit', () => {
  it('stays put when a part measures differently only because the level changed', () => {
    // the nav reads 40 px narrower once it is in the drawer (level 2+):
    // level 1 then seems to fit by 6 px, but only inside the 8 px slack
    navWidth = (l) => (l <= 1 ? 640 : 600)
    rowWidth = 1050
    const { getByTestId } = render(<Header />)
    const row = getByTestId('row')
    expect(fitOf(row)).toBe(2)
    for (let i = 0; i < 4; i++) {
      tick()
      expect(fitOf(row)).toBe(2)
    }
  })

  it('a font load that changes no part keeps the level the slack is holding', () => {
    rowWidth = 1070
    const { getByTestId } = render(<Header />)
    const row = getByTestId('row')
    tick()
    expect(fitOf(row)).toBe(2)
    // level 1 needs 1084: fits, but not with the 8 px slack
    rowWidth = 1090
    tick()
    expect(fitOf(row)).toBe(2)
    act(() => {
      fonts.dispatchEvent(new Event('loadingdone'))
    })
    expect(fitOf(row)).toBe(2)
  })

  it('decides afresh when a part really changes at the same level (web font)', () => {
    rowWidth = 1070
    const { getByTestId } = render(<Header />)
    const row = getByTestId('row')
    rowWidth = 1090
    tick()
    expect(fitOf(row)).toBe(2)
    navWidth = () => 600
    act(() => {
      fonts.dispatchEvent(new Event('loadingdone'))
    })
    expect(fitOf(row)).toBe(1)
    tick()
    expect(fitOf(row)).toBe(1)
  })
})
