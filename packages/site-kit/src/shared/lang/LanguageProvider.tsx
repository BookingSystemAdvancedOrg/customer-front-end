import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SiteConfig } from '../site'
import { LanguageContext } from './LanguageContext'
import type { LanguageContextValue } from './LanguageContext'
import { DEFAULT_LANG, isLang, language } from './languages'
import { PENDING_ATTR, PENDING_MAX_MS, applyDocument, initialLang, setUrl, store } from './document'
import type { Lang } from './languages'
import { normaliseKeep, translateTexts } from './translateApi'
import { Translator } from './translator'

/**
 * Språket på restaurangens webbplats. Ordning: ?lang= i adressen, sedan
 * gästens sparade val (booqy-lang), sedan svenska. Ingen gissning från
 * webbläsarens språk: svenska är standard.
 *
 * Sätter <html lang> och <html dir> (rtl för arabiska och persiska) redan i
 * första renderingen och startar sidöversättaren (translator.ts) för alla
 * språk utom svenska. Medan första omgången hämtas döljs sidan
 * (html[data-lang-pending]), högst 1,2 s; därefter står svenskan kvar för det
 * som inte hunnit översättas.
 *
 * SiteProvider har den inbyggd, så sajterna behöver bara LanguagePicker.
 */

function siteTerms(config: SiteConfig | null | undefined): string[] {
  if (!config) return []
  return [
    config.tenant.name,
    config.legal?.legalName,
    ...config.locations.flatMap((l) => [l.name, l.address]),
  ].filter((t): t is string => !!t)
}

export function LanguageProvider({
  children,
  config,
}: {
  children: ReactNode
  /** Restaurangen (namn, platser, adresser blir skyddade namn). null: inte
   *  hämtad än (SiteProvider), anropen väntar; utelämnad: ingen restaurang. */
  config?: SiteConfig | null
}) {
  const [lang, setLangState] = useState<Lang>(() => {
    const first = initialLang()
    if (typeof document !== 'undefined') {
      applyDocument(first)
      if (first !== DEFAULT_LANG) document.documentElement.setAttribute(PENDING_ATTR, '')
    }
    return first
  })
  const [pending, setPending] = useState(false)

  // Det översättaren läser vid varje anrop (restaurangen och extra namn).
  const configRef = useRef(config)
  const extraRef = useRef(new Map<symbol, string[]>())
  const translatorRef = useRef<Translator | null>(null)
  // Anropen väntar tills restaurangen är känd: först då går de via sajtens
  // /api med säkerhetskontrollen (den konfigureras av /site-config).
  const readyRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null)
  useLayoutEffect(() => {
    configRef.current = config
    if (config !== null) readyRef.current?.resolve()
  }, [config])

  // Före första ritningen: cachade översättningar skrivs innan sidan syns.
  // Körs igen när restaurangen laddats (då ritas hela sidan för första gången).
  const ready = config !== null
  useLayoutEffect(() => {
    if (!translatorRef.current) {
      const keepList = () => normaliseKeep([...siteTerms(configRef.current), ...[...extraRef.current.values()].flat()])
      let resolve = () => {}
      const promise = new Promise<void>((r) => {
        resolve = r
      })
      readyRef.current = { promise, resolve }
      if (configRef.current !== null) resolve()
      translatorRef.current = new Translator({
        translate: async (target, texts) => {
          await promise
          return translateTexts(target, texts, keepList(), configRef.current?.tenant.slug)
        },
        keep: keepList,
        onBusy: setPending,
      })
    }
    const t = translatorRef.current
    t.start(lang)
    t.setLang(lang)
    applyDocument(lang)
    const html = document.documentElement
    if (lang === DEFAULT_LANG) {
      html.removeAttribute(PENDING_ATTR)
      return
    }
    html.setAttribute(PENDING_ATTR, '')
    let done = false
    const reveal = () => {
      if (done) return
      done = true
      html.removeAttribute(PENDING_ATTR)
    }
    const timer = window.setTimeout(reveal, PENDING_MAX_MS)
    // Microtask: låt React-uppdateringar i samma omgång komma in i kön först.
    void Promise.resolve()
      .then(() => t.whenIdle())
      .then(reveal)
    return () => {
      window.clearTimeout(timer)
      done = true
    }
  }, [lang, ready])

  useEffect(
    () => () => {
      translatorRef.current?.stop()
      document.documentElement.removeAttribute(PENDING_ATTR)
    },
    [],
  )

  const setLang = useCallback((next: Lang) => {
    if (!isLang(next)) return
    store(next)
    setUrl(next)
    setLangState(next)
  }, [])

  const keep = useCallback((terms: Iterable<string | null | undefined>) => {
    const id = Symbol('keep')
    extraRef.current.set(id, [...terms].filter((t): t is string => !!t))
    return () => {
      extraRef.current.delete(id)
    }
  }, [])

  const value = useMemo<LanguageContextValue>(() => {
    const l = language(lang)
    return { lang, setLang, dir: l.dir, intlLocale: l.intlLocale, pending, keep }
  }, [lang, setLang, pending, keep])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
