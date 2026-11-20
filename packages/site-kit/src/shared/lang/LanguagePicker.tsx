import type { ReactNode } from 'react'
import { Select } from '../Select'
import { Flag } from './flags'
import { useLanguage } from './LanguageContext'
import { LANGUAGES, PICKER_LABEL, isLang, language } from './languages'
import type { Lang } from './languages'

/**
 * Språkväljaren i sidhuvudet (höger i toppraden): kitets rullista (Select)
 * med flagga och kod på knappen; varje rad har flagga, språkets eget namn och
 * kod. Etiketten är handskriven per språk och väljaren översätts aldrig.
 * En ring snurrar runt flaggan medan översättningar hämtas.
 *
 *   <LanguagePicker className="site-header-lang" />
 *
 * `flags` byter flagga för ett språk (t.ex. { fa: <MyFlag /> }).
 */
export function LanguagePicker({
  className,
  flags,
}: {
  className?: string
  flags?: Partial<Record<Lang, ReactNode>>
}) {
  const { lang, setLang, pending } = useLanguage()
  const current = language(lang)
  const flag = (code: Lang) => flags?.[code] ?? <Flag lang={code} />

  const options = LANGUAGES.map((l) => ({
    value: l.code,
    text: l.nativeName,
    label: (
      <span className="lang-option">
        <span className="lang-option-flag">{flag(l.code)}</span>
        <span className="lang-option-name">
          <bdi lang={l.code}>{l.nativeName}</bdi>
        </span>
        <span className="lang-option-code">{l.short}</span>
      </span>
    ),
  }))

  return (
    <span
      className={`lang-picker${pending ? ' is-busy' : ''}${className ? ` ${className}` : ''}`}
      translate="no"
      data-lang-picker=""
    >
      <Select
        className="lang-picker-button"
        value={lang}
        onChange={(v) => isLang(v) && setLang(v)}
        options={options}
        noTranslate
        align="end"
        minListWidth={208}
        aria-label={`${PICKER_LABEL[lang]}: ${current.nativeName}`}
        listLabel={PICKER_LABEL[lang]}
        valueLabel={
          <span className="lang-picker-value">
            <span className="lang-picker-flag">
              {flag(lang)}
              <span className="lang-picker-ring" aria-hidden="true" />
            </span>
            <span className="lang-picker-code">{current.short}</span>
          </span>
        }
      />
    </span>
  )
}
