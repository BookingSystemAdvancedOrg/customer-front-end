import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SiteConfig } from '../site'
import { LanguageContext } from './LanguageContext'
import type { LanguageContextValue } from './LanguageContext'
import { DEFAULT_LANG, isLang, language } from './languages'
import { PENDING_ATTR, PENDING_MAX_MS, PENDING_QUIET_MS, applyDocument, initialLang, setUrl, store } from './document'
import { loadsInFlight, pageStillLoading, setPrefetcher, whenLoadsSettled } from './loads'
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
 * (html[data-lang-pending], en tunn laddningsremsa högst upp): tills sidans
 * första data (meny, catering) är hämtad och översatt, högst 2,5 s; därefter
 * står svenskan kvar för det som inte hunnit översättas. Data som kommer
 * senare översätts innan den visas (loads.ts prefetchTexts), så texten byts
 * inte framför gästen (inget layoutskift).
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
      // Medan restaurangen hämtas syns kitets laddning (Printing), inte en tom sida.
      if (first !== DEFAULT_LANG && config !== null) document.documentElement.setAttribute(PENDING_ATTR, '')
    }
    return first
  })
  const [pending, setPending] = useState(false)
  const [incomplete, setIncomplete] = useState(false)

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
        onIncomplete: setIncomplete,
      })
    }
    const t = translatorRef.current
    t.start(lang)
    t.setLang(lang)
    applyDocument(lang)
    setPrefetcher(lang === DEFAULT_LANG ? null : (texts) => t.prefetch(texts))
    const html = document.documentElement
    if (lang === DEFAULT_LANG || !ready) {
      html.removeAttribute(PENDING_ATTR)
      return
    }
    html.setAttribute(PENDING_ATTR, '')
    // Laddningsremsan ligger utanför #root (som är dold) och utanför React.
    const bar = document.createElement('div')
    bar.className = 'lang-veil-bar'
    bar.setAttribute('aria-hidden', 'true')
    document.body.append(bar)
    let done = false
    const reveal = () => {
      if (done) return
      done = true
      html.removeAttribute(PENDING_ATTR)
      bar.remove()
    }
    const timer = window.setTimeout(reveal, PENDING_MAX_MS)
    const pause = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
    // Sidan visas när översättaren och sidans hämtningar (meny, catering och
    // deras översättning) varit tysta en stund, så att första datan inte byter
    // språk framför gästen, och inte medan ett skelett visas (sidans kod eller
    // data hämtas ännu). Högst PENDING_MAX_MS.
    void (async () => {
      await Promise.resolve()
      while (!done) {
        await t.whenIdle()
        await whenLoadsSettled()
        await pause(PENDING_QUIET_MS)
        if (done) return
        if (!t.busyNow() && loadsInFlight() === 0 && !pageStillLoading()) break
      }
      reveal()
    })()
    return () => {
      window.clearTimeout(timer)
      done = true
      bar.remove()
    }
  }, [lang, ready])

  useEffect(
    () => () => {
      translatorRef.current?.stop()
      setPrefetcher(null)
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
    return { lang, setLang, dir: l.dir, intlLocale: l.intlLocale, pending, incomplete, keep }
  }, [lang, setLang, pending, incomplete, keep])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
