import { easeOutExpo, reducedMotion } from './motion'

/**
 * Count-up: a formatted figure ("4", "1 250 kr", "12,50 kr", "6,9 %") runs
 * from a start value to its target. Prefix and suffix are kept and the last
 * frame is exactly the text the page would show anyway.
 */
export interface StatNumber {
  prefix: string
  value: number
  decimals: number
  suffix: string
}

export const COUNT_MS = 1100

export function parseStatValue(text: string): StatNumber | null {
  const m = /^(\D*?)(\d[\d\s ]*?)(?:,(\d+))?(\D*)$/.exec(text)
  if (!m) return null
  const whole = m[2].replace(/[\s ]/g, '')
  const frac = m[3] ?? ''
  const value = Number(`${whole}.${frac || '0'}`)
  if (!Number.isFinite(value)) return null
  return { prefix: m[1], value, decimals: frac.length, suffix: m[4] }
}

export function formatStatValue(n: StatNumber, current: number): string {
  const fixed = current.toFixed(n.decimals)
  const [whole, frac] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const body = n.decimals > 0 ? `${grouped},${frac}` : grouped
  return `${n.prefix}${body}${n.suffix}`
}

export interface CountOptions {
  /** Where to start (default 0). */
  from?: number
  delayMs?: number
  durationMs?: number
  /** Called when the last frame is drawn (or at once without motion). */
  onDone?: (value: number) => void
  /** Called each frame with the shown value, e.g. to remember where an interrupted count stood. */
  onFrame?: (value: number) => void
}

/**
 * Counts `el` up to `text`. Without a number in the text, with reduced
 * motion or without requestAnimationFrame the text is set at once.
 * Returns a cancel function.
 */
export function countUp(el: HTMLElement, text: string, { from = 0, delayMs = 0, durationMs = COUNT_MS, onDone, onFrame }: CountOptions = {}): () => void {
  const parsed = parseStatValue(text)
  if (!parsed || reducedMotion() || typeof requestAnimationFrame !== 'function' || from === parsed.value) {
    el.textContent = text
    onDone?.(parsed?.value ?? 0)
    return () => {}
  }
  const to = parsed.value
  const start = performance.now() + delayMs
  let raf = 0
  const frame = (now: number) => {
    const p = easeOutExpo((now - start) / durationMs)
    if (p >= 1) {
      el.textContent = text
      raf = 0
      onDone?.(to)
      return
    }
    const current = from + (to - from) * p
    el.textContent = formatStatValue(parsed, current)
    onFrame?.(current)
    raf = requestAnimationFrame(frame)
  }
  el.textContent = formatStatValue(parsed, from)
  raf = requestAnimationFrame(frame)
  return () => {
    if (raf) cancelAnimationFrame(raf)
  }
}
