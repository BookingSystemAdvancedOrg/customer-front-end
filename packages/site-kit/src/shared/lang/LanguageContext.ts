import { createContext, useContext, useEffect } from 'react'
import { DEFAULT_LANG, language } from './languages'
import type { Lang } from './languages'

export interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  dir: 'ltr' | 'rtl'
  /** Intl-locale för datum och tal i det valda språket. */
  intlLocale: string
  /** Översättningar hämtas just nu. */
  pending: boolean
  /** Lägger till namn som aldrig översätts; returnerar en funktion som tar bort dem. */
  keep: (terms: Iterable<string | null | undefined>) => () => void
}

const sv = language(DEFAULT_LANG)

/** Utanför LanguageProvider (t.ex. i tester): svenska, inget att byta. */
const FALLBACK: LanguageContextValue = {
  lang: DEFAULT_LANG,
  setLang: () => {},
  dir: sv.dir,
  intlLocale: sv.intlLocale,
  pending: false,
  keep: () => () => {},
}

export const LanguageContext = createContext<LanguageContextValue>(FALLBACK)

/** Språket på sajten (SiteProvider har LanguageProvider inbyggd). */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}

/** Registrerar namn (t.ex. rätter) som aldrig översätts medan komponenten visas. */
export function useKeepTerms(terms: readonly (string | null | undefined)[]): void {
  const { keep } = useLanguage()
  const key = terms.join('\u0000')
  useEffect(() => keep(key ? key.split('\u0000') : []), [keep, key])
}
