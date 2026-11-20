/**
 * Mjuk, snabb rullning till ett element (bokningens nästa steg), med egen
 * easing i stället för webbläsarens `scrollIntoView({ behavior: 'smooth' })`,
 * som i vissa webbläsare och i sidor med inbäddade rullytor hoppar på en
 * enda bildruta. Rullningen avbryts direkt om gästen själv rullar, trycker
 * eller skriver. Med reducerad rörelse flyttas sidan utan animation.
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/** Lugn start, snabb mitt, mjuk landning. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Den yta som faktiskt rullar: närmaste förälder med egen rullning som är
 * lägre än fönstret (en panel), annars själva sidan. En sidomslutning med
 * overflow-x: hidden blir tekniskt en rullyta men rullas aldrig av gästen,
 * därför höjdregeln.
 */
function scrollerOf(el: HTMLElement): HTMLElement {
  const root = (document.scrollingElement ?? document.documentElement) as HTMLElement
  for (let p = el.parentElement; p && p !== document.body && p !== root; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1 && p.clientHeight < window.innerHeight - 1) return p
  }
  return root
}

let active: (() => void) | null = null

/**
 * Rullar så att `el` syns: `start` lägger dess överkant högst upp (minus
 * scroll-margin-top, annars 16 px), `nearest` rullar bara så mycket som
 * behövs för att hela elementet ska synas. Returnerar ett löfte som löses
 * när rullningen är klar (eller avbröts).
 */
export function glideTo(
  el: HTMLElement | null | undefined,
  { block = 'nearest', duration = 600 }: { block?: 'start' | 'nearest'; duration?: number } = {},
): Promise<void> {
  if (!el || typeof window === 'undefined') return Promise.resolve()
  active?.()
  const scroller = scrollerOf(el)
  const isRoot = scroller === document.scrollingElement || scroller === document.documentElement
  const view = isRoot ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 16
  let delta = 0
  if (block === 'start') delta = rect.top - view.top - margin
  else if (rect.top < view.top + margin) delta = rect.top - view.top - margin
  else if (rect.bottom > view.bottom - margin) delta = Math.min(rect.bottom - view.bottom + margin, rect.top - view.top - margin)
  const from = scroller.scrollTop
  const max = scroller.scrollHeight - scroller.clientHeight
  const to = Math.max(0, Math.min(max, from + delta))
  if (Math.abs(to - from) < 1) return Promise.resolve()
  const set = (top: number) => scroller.scrollTo?.({ top, behavior: 'instant' as ScrollBehavior })
  if (prefersReducedMotion() || duration <= 0 || typeof requestAnimationFrame !== 'function') {
    set(to)
    return Promise.resolve()
  }
  return new Promise((done) => {
    const start = performance.now()
    let frame = 0
    const stop = () => {
      cancelAnimationFrame(frame)
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(type, stop)
      if (active === stop) active = null
      done()
    }
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(type, stop, { passive: true })
    active = stop
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      set(from + (to - from) * easeInOutCubic(t))
      if (t < 1) frame = requestAnimationFrame(step)
      else stop()
    }
    frame = requestAnimationFrame(step)
  })
}
