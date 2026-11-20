import { useLanguage } from './LanguageContext'
import { language } from './languages'
import type { Lang } from './languages'

/**
 * Juridiska sidor och villkor på ett annat språk än svenska: en kort
 * handskriven rad om att texten är maskinöversatt och att den svenska
 * gäller, med en knapp som byter till svenska. Översätts aldrig.
 */
const NOTE: Record<Exclude<Lang, 'sv'>, { text: string; button: string }> = {
  en: { text: 'This page was machine translated. The Swedish text applies.', button: 'Show in Swedish' },
  es: { text: 'Esta página se ha traducido automáticamente. Prevalece el texto en sueco.', button: 'Ver en sueco' },
  ar: { text: 'تمت ترجمة هذه الصفحة آليًا. النص السويدي هو المعتمد.', button: 'عرض بالسويدية' },
  fa: { text: 'این صفحه به‌صورت ماشینی ترجمه شده است. متن سوئدی معتبر است.', button: 'نمایش به سوئدی' },
}

export function MachineTranslationNote({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage()
  if (lang === 'sv') return null
  const note = NOTE[lang]
  return (
    <p
      className={`lang-note${className ? ` ${className}` : ''}`}
      lang={lang}
      dir={language(lang).dir}
      data-lang-own=""
      translate="no"
    >
      <span>{note.text}</span>{' '}
      <button type="button" className="lang-note-button" onClick={() => setLang('sv')}>
        {note.button}
      </button>
    </p>
  )
}
