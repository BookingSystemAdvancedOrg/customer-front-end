import { reducedMotion } from './motion'
import { installSoundUnlock, playClick } from './sound'
import type { Voice } from './sound'

/**
 * Press feedback, the same in every app: the click sound (sound.ts), a quick
 * squeeze and a soft tan ripple from the press point, on pointerdown and on
 * Enter or Space. Never on hover. Reduced motion: the ripple is off and the
 * squeeze becomes a short blink; the sound stays.
 */
export interface PressOptions {
  /** What answers a press. */
  targets?: string
  /** Squeezed as a block (the rest dims like text). */
  block?: string
  /** The deepest click: main actions. */
  cta?: string
  /** Pressed many times in a row (a guide): silent. */
  silent?: string
}

const DEFAULTS: Required<PressOptions> = {
  targets: "a[href], button, summary, [role='tab'], [role='button'], label[for], select, input[type='checkbox'], input[type='radio']",
  block: "button, summary, [role='tab'], [role='button'], .bq-btn",
  cta: ".bq-btn--primary, button[type='submit']",
  silent: '[data-bq-silent]',
}

const TYPING = "input[type='text'], input[type='email'], input[type='tel'], input[type='search'], input[type='password'], textarea"

function kindOf(el: Element, o: Required<PressOptions>): Voice {
  if (el.matches(o.cta)) return 'cta'
  if (el.matches("button, summary, [role='tab'], [role='button'], .bq-btn, select, input, label")) return 'press'
  return 'tick'
}

/** The signal: a dot and two rings where the press landed, anywhere on the page. */
export function ripple(x: number, y: number): void {
  if (reducedMotion() || typeof document === 'undefined') return
  const el = document.createElement('span')
  el.className = 'bq-ripple'
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 900)
}

function squeeze(el: Element, o: Required<PressOptions>) {
  const cls = el.matches(o.block) ? 'bq-is-pressed' : 'bq-is-pressed-text'
  el.classList.add(cls)
  window.setTimeout(() => el.classList.remove(cls), 160)
}

let installed = false

/** Listens once on the document; every press in the app gets the feel. */
export function installPress(options: PressOptions = {}): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  const o = { ...DEFAULTS, ...options }
  installSoundUnlock()
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
      const el = (e.target as Element | null)?.closest?.(o.targets)
      if (!el || (el as HTMLButtonElement).disabled) {
        ripple(e.clientX, e.clientY)
        return
      }
      if (!el.closest(o.silent)) playClick(kindOf(el, o))
      squeeze(el, o)
      ripple(e.clientX, e.clientY)
    },
    { passive: true },
  )
  document.addEventListener('keydown', (e) => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return
    const el = document.activeElement
    if (!el || !el.matches(o.targets) || el.matches(TYPING)) return
    if (e.key === ' ' && el.matches('a[href]')) return
    const r = el.getBoundingClientRect()
    if (!el.closest(o.silent)) playClick(kindOf(el, o))
    squeeze(el, o)
    ripple(r.left + r.width / 2, r.top + r.height / 2)
  })
}
