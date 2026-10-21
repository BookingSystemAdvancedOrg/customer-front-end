import { useCallback, useSyncExternalStore } from 'react'
import { THEME_KEY } from './storageRegistry'

/**
 * Ljust och mörkt läge. Gästens val ligger i localStorage (booqy-theme) och
 * på <html data-theme>; public/theme.v1.js sätter attributet innan sidan
 * ritas, så att den aldrig blinkar ljus före mörk. Utan val följer sajten
 * systemets inställning, även när den ändras medan sidan är öppen. Samma
 * nyckel i alla Booqys appar.
 */

export type Theme = 'light' | 'dark'

/** Färgen webbläsarens egen ram får (meta theme-color): skrivbordet. */
const THEME_COLOR: Record<Theme, string> = { light: '#f1eee6', dark: '#1c1918' }
const DARK_QUERY = '(prefers-color-scheme: dark)'

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

/** Systemets inställning; ljust där den inte går att läsa (t.ex. i tester). */
export function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Läget just nu: det som sitter på <html>, annars det sparade, annars systemets. */
export function currentTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (isTheme(attr)) return attr
  }
  return storedTheme() ?? systemTheme()
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Sätter läget på sidan (attribut och ramfärg) utan att spara det. */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLOR[theme]
  }
  emit()
}

/** Sparar valet och sätter det. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* privat läge utan lagring: valet gäller tills sidan laddas om */
  }
  applyTheme(theme)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Byte i en annan flik följer med hit.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY && isTheme(e.newValue)) applyTheme(e.newValue)
  }
  window.addEventListener('storage', onStorage)
  // Utan eget val följer sidan systemet, även när det byter medan den är öppen.
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
  const onMedia = () => {
    if (!storedTheme()) applyTheme(systemTheme())
  }
  media?.addEventListener('change', onMedia)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
    media?.removeEventListener('change', onMedia)
  }
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'light' as Theme)
  const toggle = useCallback(() => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'), [])
  return { theme, toggle, setTheme }
}
