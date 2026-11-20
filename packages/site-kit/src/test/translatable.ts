import { Translator } from '../shared/lang/translator'

/**
 * Strängarna sidöversättaren skulle skicka till POST /translate för det som
 * står i dokumentet nu. Gästdata (namn, telefon, e-post, meddelanden) får
 * aldrig finnas bland dem (translate="no" i komponenterna).
 */
export async function translatableStrings(): Promise<string[]> {
  const sent: string[] = []
  const t = new Translator({
    translate: async (_lang, texts) => {
      sent.push(...texts)
      return { texts }
    },
    debounceMs: 0,
  })
  t.start('en')
  await new Promise((r) => setTimeout(r, 0))
  await t.whenIdle()
  t.stop()
  return sent
}

/** Alla gästvärden som förekommer i någon skickad sträng. */
export function leaked(sent: string[], guestValues: string[]): string[] {
  return guestValues.filter((v) => sent.some((s) => s.includes(v)))
}
