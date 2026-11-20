import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicMenuWithCategories } from '../../features/meny/menuApi'
import { json } from '../../test/siteData'
import { LanguageContext, useLanguage } from './LanguageContext'
import { LanguagePicker } from './LanguagePicker'
import { LanguageProvider } from './LanguageProvider'
import { PENDING_ATTR, PENDING_MAX_MS } from './document'
import { MachineTranslationNote } from './MachineTranslationNote'
import { PARTIAL_NOTE, currentLang } from './languages'

function translateFetch() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { lang: string; texts: string[] }
    return json({ lang: body.lang, texts: body.texts.map((t) => `[${body.lang}] ${t}`), partial: false })
  })
}

function renderSite() {
  return render(
    <LanguageProvider>
      <header>
        <LanguagePicker />
      </header>
      <main>
        <h1>Boka bord</h1>
        <MachineTranslationNote />
      </main>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
  sessionStorage.clear()
  const html = document.documentElement
  html.removeAttribute('lang')
  html.removeAttribute('dir')
  html.removeAttribute(PENDING_ATTR)
})

describe('LanguageProvider', () => {
  it('defaults to Swedish without asking the server', () => {
    const fetchMock = translateFetch()
    vi.stubGlobal('fetch', fetchMock)
    renderSite()
    expect(document.documentElement).toHaveAttribute('lang', 'sv')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
    expect(document.documentElement).not.toHaveAttribute(PENDING_ATTR)
    expect(screen.getByRole('heading').textContent).toBe('Boka bord')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('takes ?lang= before the stored choice, sets rtl for Arabic and reveals the page when translated', async () => {
    localStorage.setItem('booqy-lang', 'en')
    window.history.replaceState(null, '', '/?lang=ar')
    const fetchMock = translateFetch()
    vi.stubGlobal('fetch', fetchMock)
    renderSite()
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(currentLang()).toBe('ar')
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('[ar] Boka bord'))
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute(PENDING_ATTR))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.test/translate')
    expect(JSON.parse(String(init?.body))).toMatchObject({ lang: 'ar' })
  })

  it('uses the stored choice and moves Anar\'s old key over once', () => {
    vi.stubGlobal('fetch', translateFetch())
    localStorage.setItem('anar-lang', 'fa')
    renderSite()
    expect(document.documentElement).toHaveAttribute('lang', 'fa')
    expect(localStorage.getItem('booqy-lang')).toBe('fa')
  })

  it('never hides the page longer than 2.5 s, even when the API hangs', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    localStorage.setItem('booqy-lang', 'es')
    renderSite()
    expect(document.documentElement).toHaveAttribute(PENDING_ATTR)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_MAX_MS + 10)
    })
    expect(document.documentElement).not.toHaveAttribute(PENDING_ATTR)
    expect(screen.getByRole('heading').textContent).toBe('Boka bord')
  })

  it('keeps the loading screen visible while the restaurant is fetched, then hides for the first pass', async () => {
    const fetchMock = translateFetch()
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('booqy-lang', 'en')
    const { rerender } = render(<LanguageProvider config={null}><p>Laddar</p></LanguageProvider>)
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    expect(document.documentElement).not.toHaveAttribute(PENDING_ATTR)
    rerender(<LanguageProvider><h1>Boka bord</h1></LanguageProvider>)
    expect(document.documentElement).toHaveAttribute(PENDING_ATTR)
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('[en] Boka bord'))
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute(PENDING_ATTR))
  })
})

describe('LanguageProvider: no text swapped in front of the guest', () => {
  function MenuPage() {
    const [desc, setDesc] = useState<string | null>(null)
    useEffect(() => {
      void getPublicMenuWithCategories('loc-1').then((m) => setDesc(m.items[0]?.description ?? null))
    }, [])
    return <main>{desc ? <p data-testid="desc">{desc}</p> : <p>Laddar</p>}</main>
  }

  it('keeps the page hidden until the first menu is fetched and translated, then shows it translated', async () => {
    const seen: string[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/translate')) {
        const body = JSON.parse(String(init?.body)) as { lang: string; texts: string[] }
        seen.push(...body.texts)
        await new Promise((r) => setTimeout(r, 30))
        return json({ lang: body.lang, texts: body.texts.map((t) => `[${body.lang}] ${t}`), partial: false })
      }
      await new Promise((r) => setTimeout(r, 400))
      return json({
        items: [{ menuItemId: 'm1', name: 'Kebab Shiraz', description: 'Grillad lax med citron', price: 245, category: 'varmratter' }],
        categories: [{ categoryId: 'varmratter', name: 'Varmrätter' }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('booqy-lang', 'en')
    render(
      <LanguageProvider>
        <MenuPage />
      </LanguageProvider>,
    )
    expect(document.documentElement).toHaveAttribute(PENDING_ATTR)
    expect(document.querySelector('.lang-veil-bar')).not.toBeNull()
    // Det gästen ser i samma stund som sidan visas.
    let atReveal: string | null | undefined
    const observer = new MutationObserver(() => {
      if (atReveal === undefined && !document.documentElement.hasAttribute(PENDING_ATTR)) {
        atReveal = screen.queryByTestId('desc')?.textContent ?? null
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [PENDING_ATTR] })
    await waitFor(() => expect(document.documentElement).not.toHaveAttribute(PENDING_ATTR), { timeout: 2_000 })
    observer.disconnect()
    expect(atReveal).toBe('[en] Grillad lax med citron')
    expect(document.querySelector('.lang-veil-bar')).toBeNull()
    expect(seen).toContain('Grillad lax med citron')
    expect(seen).not.toContain('Kebab Shiraz')
  })

  it('shows a Swedish page normally without waiting for data', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(
      <LanguageProvider>
        <MenuPage />
      </LanguageProvider>,
    )
    expect(document.documentElement).not.toHaveAttribute(PENDING_ATTR)
    expect(document.querySelector('.lang-veil-bar')).toBeNull()
  })
})

describe('LanguagePicker', () => {
  function Partial({ lang }: { lang: 'en' | 'sv' }) {
    const base = useLanguage()
    return (
      <LanguageContext.Provider value={{ ...base, lang, incomplete: true }}>
        <LanguagePicker />
      </LanguageContext.Provider>
    )
  }

  it('shows a small notice when part of the page could not be translated', () => {
    const { unmount } = render(<Partial lang="en" />)
    const button = screen.getByRole('combobox', { name: `Language: English. ${PARTIAL_NOTE.en}` })
    expect(button.querySelector('.lang-picker-partial')).not.toBeNull()
    expect(button.closest('.lang-picker')).toHaveAttribute('title', PARTIAL_NOTE.en)
    unmount()
    // På svenska finns inget att säga.
    render(<Partial lang="sv" />)
    expect(screen.getByRole('combobox', { name: 'Språk: Svenska' }).querySelector('.lang-picker-partial')).toBeNull()
  })

  it('shows flag and code, lists every language by its own name and is never translated', async () => {
    vi.stubGlobal('fetch', translateFetch())
    const user = userEvent.setup()
    renderSite()
    const button = screen.getByRole('combobox', { name: 'Språk: Svenska' })
    expect(button).toHaveTextContent('SV')
    expect(button.querySelector('svg.lang-flag')).not.toBeNull()
    expect(button.closest('[translate="no"]')).not.toBeNull()

    await user.click(button)
    const list = screen.getByRole('listbox', { name: 'Språk' })
    const names = within(list).getAllByRole('option').map((o) => o.textContent)
    expect(names).toEqual(['SvenskaSV', 'EnglishEN', 'EspañolES', 'العربيةAR', 'فارسیFA'])
    expect(list.closest('[translate="no"]')).not.toBeNull()
    expect(within(list).getByRole('option', { name: /العربية/ }).querySelector('bdi[lang="ar"]')).not.toBeNull()
  })

  it('switches with the keyboard, stores the choice and puts it in the address', async () => {
    vi.stubGlobal('fetch', translateFetch())
    const user = userEvent.setup()
    renderSite()
    const button = screen.getByRole('combobox', { name: 'Språk: Svenska' })
    button.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByRole('combobox', { name: 'Language: English' })).toHaveTextContent('EN')
    expect(localStorage.getItem('booqy-lang')).toBe('en')
    expect(window.location.search).toBe('?lang=en')
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('[en] Boka bord'))

    // Juridisk text: handskriven rad och en knapp tillbaka till svenska.
    const back = screen.getByRole('button', { name: 'Show in Swedish' })
    expect(back.closest('[data-lang-own]')).not.toBeNull()
    await user.click(back)
    expect(document.documentElement).toHaveAttribute('lang', 'sv')
    expect(window.location.search).toBe('')
    expect(screen.getByRole('heading').textContent).toBe('Boka bord')
  })
})
