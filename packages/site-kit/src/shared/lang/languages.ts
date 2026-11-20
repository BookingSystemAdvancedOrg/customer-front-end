/**
 * Språken gästen kan välja på restaurangens webbplats. Svenska är källan och
 * standard; de andra översätts med Amazon Translate (POST /translate, se
 * translator.ts). Latinska siffror i alla språk, så att priser, tider och
 * telefonnummer ser ut som i SMS:en och i de oöversatta delarna.
 */

export type Lang = 'sv' | 'en' | 'es' | 'ar' | 'fa'

export interface Language {
  code: Lang
  /** Namnet på språket självt (visas aldrig översatt). */
  nativeName: string
  /** Koden på knappen (SV, EN ...). */
  short: string
  dir: 'ltr' | 'rtl'
  /** Intl-locale för datum och tal. fa-IR har annars persisk kalender. */
  intlLocale: string
  /** Stripes locale; Stripe har ingen persiska. */
  stripeLocale: 'sv' | 'en' | 'es' | 'ar'
  /** Bokningens språk för SMS och mejl (API:t har bara sv och en). */
  messageLanguage: 'sv' | 'en'
}

export const DEFAULT_LANG: Lang = 'sv'

export const LANGUAGES: readonly Language[] = [
  { code: 'sv', nativeName: 'Svenska', short: 'SV', dir: 'ltr', intlLocale: 'sv-SE', stripeLocale: 'sv', messageLanguage: 'sv' },
  { code: 'en', nativeName: 'English', short: 'EN', dir: 'ltr', intlLocale: 'en-GB', stripeLocale: 'en', messageLanguage: 'en' },
  { code: 'es', nativeName: 'Español', short: 'ES', dir: 'ltr', intlLocale: 'es-ES', stripeLocale: 'es', messageLanguage: 'en' },
  { code: 'ar', nativeName: 'العربية', short: 'AR', dir: 'rtl', intlLocale: 'ar-u-nu-latn', stripeLocale: 'ar', messageLanguage: 'en' },
  {
    code: 'fa',
    nativeName: 'فارسی',
    short: 'FA',
    dir: 'rtl',
    intlLocale: 'fa-IR-u-ca-gregory-nu-latn',
    stripeLocale: 'en',
    messageLanguage: 'en',
  },
]

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && LANGUAGES.some((l) => l.code === value)
}

export function language(code: Lang): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]
}

/** Språkväljarens egen etikett: skriven för hand, aldrig maskinöversatt. */
export const PICKER_LABEL: Record<Lang, string> = {
  sv: 'Språk',
  en: 'Language',
  es: 'Idioma',
  ar: 'اللغة',
  fa: 'زبان',
}

// Språket just nu, för kod utanför React (Stripe, bokningens språk).
let active: Lang = DEFAULT_LANG

export function currentLang(): Lang {
  return active
}

/** Sätts av LanguageProvider. */
export function setCurrentLang(lang: Lang): void {
  active = lang
}
