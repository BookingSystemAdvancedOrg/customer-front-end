import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Translator, splitLong, worthTranslating } from './translator'
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
