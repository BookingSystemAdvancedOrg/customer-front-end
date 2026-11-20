import { afterEach, describe, expect, it, vi } from 'vitest'
import { glideTo } from './glide'

/** A target 1200 px down a 800 px window, on a page scrolled to the top. */
function setup(reduce: boolean) {
  const root = (document.scrollingElement ?? document.documentElement) as HTMLElement
  let top = 0
  const tops: number[] = []
  Object.defineProperty(root, 'scrollTop', { get: () => top, configurable: true })
  Object.defineProperty(root, 'scrollHeight', { value: 4000, configurable: true })
  Object.defineProperty(root, 'clientHeight', { value: 800, configurable: true })
  root.scrollTo = ((o: ScrollToOptions) => { top = o.top ?? top; tops.push(top) }) as typeof root.scrollTo
  vi.stubGlobal('innerHeight', 800)
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce') })) as unknown as typeof window.matchMedia
  const el = document.createElement('div')
  document.body.append(el)
  el.getBoundingClientRect = () => ({ top: 1200 - top, bottom: 1300 - top, left: 0, right: 100, width: 100, height: 100 }) as DOMRect
  return { el, tops }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('glideTo', () => {
  it('eases to the target over several frames instead of jumping', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number)
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    const { el, tops } = setup(false)
    const done = glideTo(el, { block: 'start', duration: 600 })
    await vi.advanceTimersByTimeAsync(700)
    await done
    // 1200 - 16 px margin: reached at the end, with many small steps on the way.
    expect(tops.at(-1)).toBe(1184)
    expect(tops.length).toBeGreaterThan(20)
    expect(tops[1]).toBeLessThan(100)
  })

  it('moves at once with reduced motion', async () => {
    const { el, tops } = setup(true)
    await glideTo(el, { block: 'start' })
    expect(tops).toEqual([1184])
  })

  it('leaves a target that is already in view alone', async () => {
    const { el, tops } = setup(true)
    el.getBoundingClientRect = () => ({ top: 200, bottom: 300 }) as DOMRect
    await glideTo(el, { block: 'nearest' })
    expect(tops).toEqual([])
  })
})
