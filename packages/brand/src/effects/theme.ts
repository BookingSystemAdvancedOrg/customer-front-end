import { tokens } from '../generated/tokens'

/**
 * Light and dark mode, one key in every Booqy app: the choice lives in
 * localStorage ("booqy-theme") and on <html data-theme>. Each app sets the
 * attribute before paint with its own boot script (public/theme.v2.js).
 * Without a choice admin is light and the console and guest sites follow the
 * system (`configureTheme`). booqy.se has one look and never calls this.
 */
export type Theme = 'light' | 'dark'
export type ThemeDefault = Theme | 'system'

/** Same key as the apps' storage registries list. */
export const THEME_KEY = 'booqy-theme'

/** The browser frame colour (meta theme-color) per mode: the room. */
export const THEME_COLOR: Record<Theme, string> = { light: tokens.color.light.bg, dark: tokens.color.dark.bg }

let fallback: ThemeDefault = 'light'

export function configureTheme(options: { defaultTheme: ThemeDefault }): void {
  fallback = options.defaultTheme
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

function defaultTheme(): Theme {
  if (fallback !== 'system') return fallback
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The mode now: the attribute on <html>, else the stored choice, else the default. */
export function currentTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (isTheme(attr)) return attr
  }
  return storedTheme() ?? defaultTheme()
}

const listeners = new Set<() => void>()

/** Sets the mode on the page (attribute and frame colour) without saving it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = THEME_COLOR[theme]
  listeners.forEach((l) => l())
}

/** Saves the choice and applies it. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* private mode without storage: the choice lasts until reload */
  }
  applyTheme(theme)
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  // a change in another tab follows here
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY && isTheme(e.newValue)) applyTheme(e.newValue)
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export const THEME_SWEEP_MS = 700

/**
 * Theme sweep: the new colours grow out in a circle from the toggle (View
 * Transitions) until they cover the page. Without support, without an
 * origin or with reduced motion the switch is instant.
 */
export function switchTheme(theme: Theme, origin?: { x: number; y: number }): void {
  const doc = document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } }
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!origin || reduce || typeof doc.startViewTransition !== 'function') {
    setTheme(theme)
    return
  }
  const { x, y } = origin
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const transition = doc.startViewTransition(() => setTheme(theme))
  transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: THEME_SWEEP_MS, easing: tokens.ease.sweep, pseudoElement: '::view-transition-new(root)' },
    )
  }, () => {})
}

export function toggleTheme(origin?: { x: number; y: number }): void {
  switchTheme(currentTheme() === 'dark' ? 'light' : 'dark', origin)
}
