import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Translator, fill, prepare, splitLong, worthTranslating } from './translator'
import type { TranslateFn } from './translator'

const fake = (): TranslateFn & { mock: { calls: unknown[][] } } =>
  vi.fn(async (lang: string, texts: string[]) => ({ texts: texts.map((t) => `[${lang}] ${t}`) })) as never

let current: Translator | null = null
function start(translate: TranslateFn, lang: 'sv' | 'en' = 'en', keep: string[] = []) {
  current = new Translator({ translate, keep: () => keep, debounceMs: 0, retryMs: 20 })
  current.start(lang)
  return current
}

afterEach(() => {
  cleanup()
  current?.stop()
  current = null
  document.body.innerHTML = ''
  sessionStorage.clear()
})

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5))
    await current?.whenIdle()
  })
}

describe('worthTranslating', () => {
  it.each(['245 kr', '18:00\u201322:00', '1 245,50 SEK', '245:-', '070-174 06 05', 'info@krogen.se', 'https://krogen.se', '12 %', ''])(
    'skips data only: %s',
    (s) => expect(worthTranslating(s)).toBe(false),
  )
  it('translates words and skips protected names', () => {
    expect(worthTranslating('Boka bord')).toBe(true)
    expect(worthTranslating('Anar', ['Anar'])).toBe(false)
  })
})

describe('splitLong', () => {
  it('keeps short text whole and splits long text at sentence ends', () => {
    expect(splitLong('Hej. Då.')).toEqual(['Hej. Då.'])
    const parts = splitLong(`${'a'.repeat(20)}. ${'b'.repeat(20)}. ${'c'.repeat(5)}.`, 30)
    expect(parts).toEqual([`${'a'.repeat(20)}.`, `${'b'.repeat(20)}. ${'c'.repeat(5)}.`])
    expect(splitLong('x'.repeat(65), 30).every((p) => p.length <= 30)).toBe(true)
  })
})

describe('Translator', () => {
  it('translates text and the listed attributes in place, and skips what must not change', async () => {
    document.body.innerHTML = `
      <h1> Boka bord </h1>
      <input placeholder="Ditt namn" aria-label="Namn">
      <input type="submit" value="Skicka">
      <input type="text" value="Sara Ek">
      <img alt="Matsalen" title="Bild på matsalen">
      <p translate="no">Kebab Shiraz</p>
      <div data-lang-own><p>Own words</p></div>
      <textarea>Allergi mot nötter</textarea>
      <code>npm run build</code>
      <p>245 kr</p>
      <p>Anar</p>`
    const translate = fake()
    start(translate, 'en', ['Anar'])
    await settle()
    const h1 = document.querySelector('h1')!
    expect(h1.textContent).toBe(' [en] Boka bord ')
    const [named, submit, text] = document.querySelectorAll('input')
    expect(named.getAttribute('placeholder')).toBe('[en] Ditt namn')
    expect(named.getAttribute('aria-label')).toBe('[en] Namn')
    expect(submit.getAttribute('value')).toBe('[en] Skicka')
    expect(text.getAttribute('value')).toBe('Sara Ek')
    expect(document.querySelector('img')!.getAttribute('alt')).toBe('[en] Matsalen')
    expect(document.body.textContent).toContain('Kebab Shiraz')
    const sent = translate.mock.calls.flatMap((c) => c[1] as string[])
    for (const never of ['Kebab Shiraz', 'Own words', 'Allergi mot nötter', 'npm run build', '245 kr', 'Anar', 'Sara Ek']) {
      expect(sent).not.toContain(never)
    }
  })

  it('applies cached translations before the next frame, without a request', () => {
    sessionStorage.setItem('booqy-lang-cache:en', JSON.stringify({ 'Boka bord': 'Book a table' }))
    document.body.innerHTML = '<p>Boka bord</p>'
    const translate = fake()
    start(translate)
    expect(document.querySelector('p')!.textContent).toBe('Book a table')
    expect(translate).not.toHaveBeenCalled()
  })

  it('translates new Swedish from React again, ignores its own writes, and restores Swedish exactly', async () => {
    function Counter() {
      const [n, setN] = useState(0)
      return (
        <div>
          <button type="button" onClick={() => setN(n + 1)}>{n % 2 === 0 ? 'Lägg till' : 'Ta bort'}</button>
          {createPortal(<p data-testid="portal">I portalen</p>, document.body)}
        </div>
      )
    }
    render(<Counter />)
    const translate = fake()
    const t = start(translate)
    await settle()
    const button = screen.getByRole('button')
    expect(button.textContent).toBe('[en] Lägg till')
    expect(screen.getByTestId('portal').textContent).toBe('[en] I portalen')

    act(() => button.click())
    await settle()
    expect(button.textContent).toBe('[en] Ta bort')
    // Varje sträng skickas en gång; de egna skrivningarna triggar inget nytt.
    const sent = translate.mock.calls.flatMap((c) => c[1] as string[])
    expect(sent.sort()).toEqual(['I portalen', 'Lägg till', 'Ta bort'])

    act(() => t.setLang('sv'))
    expect(button.textContent).toBe('Ta bort')
    expect(screen.getByTestId('portal').textContent).toBe('I portalen')

    // React fortsätter att äga noden efter återställningen.
    act(() => button.click())
    expect(button.textContent).toBe('Lägg till')
  })

  it('switches between two target languages through Swedish', async () => {
    document.body.innerHTML = '<p>Meny</p>'
    const translate = fake()
    const t = start(translate)
    await settle()
    act(() => t.setLang('es'))
    await settle()
    expect(document.querySelector('p')!.textContent).toBe('[es] Meny')
  })

  it('keeps Swedish when the request fails and retries once', async () => {
    document.body.innerHTML = '<p>Öppettider</p>'
    const translate = vi.fn<TranslateFn>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ texts: ['Opening hours'] })
    start(translate)
    await settle()
    expect(document.querySelector('p')!.textContent).toBe('Öppettider')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
      await current?.whenIdle()
    })
    expect(translate).toHaveBeenCalledTimes(2)
    expect(document.querySelector('p')!.textContent).toBe('Opening hours')
  })

  it('stays Swedish without an error after two failures', async () => {
    document.body.innerHTML = '<p>Kontakt</p>'
    const translate = vi.fn<TranslateFn>().mockRejectedValue(new Error('429'))
    start(translate)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(translate).toHaveBeenCalledTimes(2)
    expect(document.querySelector('p')!.textContent).toBe('Kontakt')
  })

  it('sends at most 100 strings per request', async () => {
    document.body.innerHTML = Array.from({ length: 150 }, (_, i) => `<p>Rad nummer ${i}</p>`).join('')
    const translate = fake()
    start(translate)
    await settle()
    expect(translate.mock.calls.map((c) => (c[1] as string[]).length)).toEqual([100, 50])
  })
})

describe('prepare and fill', () => {
  it('turns clock times into fixed slots and puts them back', () => {
    const a = prepare('Bordet hålls i 14:59')
    const b = prepare('Bordet hålls i 03:12')
    expect(a.text).toBe(b.text)
    expect(a.text).toBe('Bordet hålls i 10:10')
    expect(fill('The table is held for 10:10', a.slots)).toBe('The table is held for 14:59')
    expect(prepare('Öppet 18:00-22:00').slots.map((s) => s[1])).toEqual(['18:00', '22:00'])
  })

  it('drops "kl" before a time and at the end of a text piece', () => {
    expect(prepare('Vi ses torsdag kl 18:00. Välkommen!').text).toBe('Vi ses torsdag 10:10. Välkommen!')
    expect(prepare('Ditt bord är klart kl. 19:30!').text).toBe('Ditt bord är klart 10:10!')
    expect(prepare('Bordet hålls åt dig till kl').text).toBe('Bordet hålls åt dig till')
    expect(prepare('kl').text).toBe('')
    expect(prepare('Klart').text).toBe('Klart')
    expect(prepare('Fyll i alla fält').text).toBe('Fyll i alla fält')
  })

  it('leaves amounts, years and dates alone', () => {
    expect(prepare('Totalt 1.245 kr').slots).toEqual([])
    expect(prepare('Bokad 2026-11-20').slots).toEqual([])
  })
})

describe('Translator: sentences, attributes and the head', () => {
  it('translates a countdown as one string and keeps the live number', async () => {
    document.body.innerHTML = '<div role="timer" aria-label="Bordet hålls i 14:59"></div>'
    const translate = fake()
    start(translate)
    await settle()
    const timer = document.querySelector('[role=timer]')!
    expect(timer.getAttribute('aria-label')).toBe('[en] Bordet hålls i 14:59')
    act(() => timer.setAttribute('aria-label', 'Bordet hålls i 14:58'))
    await settle()
    expect(timer.getAttribute('aria-label')).toBe('[en] Bordet hålls i 14:58')
    expect(translate.mock.calls.flatMap((c) => c[1] as string[])).toEqual(['Bordet hålls i 10:10'])
  })

  it('removes a lone "kl" between a date and a time instead of sending it', async () => {
    document.body.innerHTML = '<p><span translate="no">20 nov</span> kl <span translate="no">18:00</span></p>'
    const translate = fake()
    start(translate)
    await settle()
    expect(document.querySelector('p')!.textContent).toBe('20 nov 18:00')
    expect(translate).not.toHaveBeenCalled()
  })

  it('translates a textarea placeholder and an iframe title but never their content or payment frames', async () => {
    document.body.innerHTML = `
      <textarea placeholder="Allergier, barnstol, firande">Gästens egen text</textarea>
      <iframe title="Karta: Anar"></iframe>
      <iframe title="Säker betalning" name="__privateStripeFrame1"></iframe>`
    const translate = fake()
    start(translate)
    await settle()
    expect(document.querySelector('textarea')!.getAttribute('placeholder')).toBe('[en] Allergier, barnstol, firande')
    expect(document.querySelector('textarea')!.textContent).toBe('Gästens egen text')
    const [map, stripe] = document.querySelectorAll('iframe')
    expect(map.getAttribute('title')).toBe('[en] Karta: Anar')
    expect(stripe.getAttribute('title')).toBe('Säker betalning')
    // Ett textfält som kommer senare (nästa steg i bokningen) får också sin platshållare.
    const later = document.createElement('textarea')
    later.setAttribute('placeholder', 'Meddelande')
    act(() => document.body.append(later))
    await settle()
    expect(later.getAttribute('placeholder')).toBe('[en] Meddelande')
  })

  it("translates the page description in <head> and restores it in Swedish", async () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    meta.setAttribute('content', 'Persisk mat i Stockholm')
    const og = document.createElement('meta')
    og.setAttribute('property', 'og:image')
    og.setAttribute('content', 'https://example.se/bild.jpg')
    document.head.append(meta, og)
    try {
      const translate = fake()
      const t = start(translate)
      await settle()
      expect(meta.getAttribute('content')).toBe('[en] Persisk mat i Stockholm')
      expect(og.getAttribute('content')).toBe('https://example.se/bild.jpg')
      act(() => t.setLang('sv'))
      expect(meta.getAttribute('content')).toBe('Persisk mat i Stockholm')
    } finally {
      meta.remove()
      og.remove()
    }
  })

  it('reports when part of the page could not be translated', async () => {
    document.body.innerHTML = '<p>Kontakt</p><p>Meny</p>'
    const translate = vi.fn<TranslateFn>(async (_l, texts) => ({
      texts: texts.map((t) => (t === 'Meny' ? 'Menu' : t)),
      partial: true,
    }))
    const onIncomplete = vi.fn()
    current = new Translator({ translate, debounceMs: 0, retryMs: 10, onIncomplete })
    current.start('en')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
      await current?.whenIdle()
    })
    expect(document.body.textContent).toBe('KontaktMenu')
    expect(onIncomplete).toHaveBeenLastCalledWith(true)
    act(() => current!.setLang('sv'))
    expect(onIncomplete).toHaveBeenLastCalledWith(false)
  })

  it('translates data before it is inserted, so new nodes are written before paint', async () => {
    const translate = fake()
    const t = start(translate)
    await act(async () => {
      await t.prefetch(['  Grillad lax med citron ', 'Varmrätter', '245 kr'])
    })
    expect(translate.mock.calls.flatMap((c) => c[1] as string[])).toEqual(['Grillad lax med citron', 'Varmrätter'])
    const p = document.createElement('p')
    p.textContent = 'Grillad lax med citron'
    document.body.append(p)
    // Observerns callback (en mikrouppgift) skriver träffen; inget nytt anrop.
    await act(async () => {
      await Promise.resolve()
    })
    expect(p.textContent).toBe('[en] Grillad lax med citron')
    expect(translate).toHaveBeenCalledTimes(1)
  })
})
