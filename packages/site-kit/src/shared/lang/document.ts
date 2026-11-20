import { ANAR_LANG_KEY, LANG_KEY } from '../storageRegistry'
import { DEFAULT_LANG, isLang, language, setCurrentLang } from './languages'
import type { Lang } from './languages'

/** Språkets plats i adressen, på <html> och i gästens lagring (LanguageProvider). */

export const LANG_PARAM = 'lang'
export const PENDING_ATTR = 'data-lang-pending'
export const PENDING_MAX_MS = 1_200

function readStored(): Lang | null {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (isLang(stored)) return stored
    // Anar hade en egen nyckel före kitets väljare: flyttas över en gång.
    const anar = localStorage.getItem(ANAR_LANG_KEY)
    if (isLang(anar)) {
      localStorage.setItem(LANG_KEY, anar)
      return anar
    }
  } catch {
    // Ingen lagring (privat läge): svenska.
  }
  return null
}

export function store(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    // Valet gäller då bara den här sidvisningen.
  }
}

/** Språket när sidan öppnas. */
export function initialLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG
  const fromUrl = new URLSearchParams(window.location.search).get(LANG_PARAM)
  if (isLang(fromUrl)) return fromUrl
  return readStored() ?? DEFAULT_LANG
}

export function applyDocument(lang: Lang): void {
  const l = language(lang)
  const html = document.documentElement
  html.setAttribute('lang', lang)
  html.setAttribute('dir', l.dir)
  setCurrentLang(lang)
}

export function setUrl(lang: Lang): void {
  try {
    const url = new URL(window.location.href)
    if (lang === DEFAULT_LANG) url.searchParams.delete(LANG_PARAM)
    else url.searchParams.set(LANG_PARAM, lang)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    // Adressen är bara bekvämlighet.
  }
}
