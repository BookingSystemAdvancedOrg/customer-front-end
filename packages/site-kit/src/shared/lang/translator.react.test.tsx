import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Translator } from './translator'
import type { TranslateFn } from './translator'

/** React keeps owning every node the translator wrote to: lists that reorder,
 *  branches that unmount, mixed text and values that change. */

let current: Translator | null = null
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

describe('Translator with React', () => {
  it('survives reordering, unmounting and mixed text without React errors', async () => {
    const errors = vi.spyOn(console, 'error')
    const items = ['Förrätter', 'Varmrätter', 'Efterrätter']
    function Page() {
      const [order, setOrder] = useState(items)
      const [open, setOpen] = useState(true)
      const [n, setN] = useState(2)
      return (
        <div>
          <button type="button" data-testid="flip" onClick={() => setOrder([...order].reverse())}>Vänd</button>
          <button type="button" data-testid="toggle" onClick={() => setOpen(!open)}>Visa</button>
          <button type="button" data-testid="inc" onClick={() => setN(n + 1)}>Fler</button>
          <ul>{order.map((c) => <li key={c}>{c}</li>)}</ul>
          {open ? <p data-testid="extra">Extra text här</p> : <span>Stängt nu</span>}
          <p data-testid="mixed">Ni är {n} personer i sällskapet</p>
        </div>
      )
    }
    render(<Page />)
    const translate: TranslateFn = vi.fn(async (lang: string, texts: string[]) => ({ texts: texts.map((t: string) => `[${lang}] ${t}`) }))
    current = new Translator({ translate, debounceMs: 0, retryMs: 20 })
    current.start('en')
    await settle()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(items.map((i) => `[en] ${i}`))

    act(() => screen.getByTestId('flip').click())
    act(() => screen.getByTestId('toggle').click())
    act(() => screen.getByTestId('inc').click())
    await settle()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([...items].reverse().map((i) => `[en] ${i}`))
    expect(screen.queryByTestId('extra')).toBeNull()
    expect(screen.getByText('[en] Stängt nu')).toBeInTheDocument()
    expect(screen.getByTestId('mixed').textContent).toBe('[en] Ni är 3 [en] personer i sällskapet')

    act(() => screen.getByTestId('toggle').click())
    await settle()
    expect(screen.getByTestId('extra').textContent).toBe('[en] Extra text här')

    act(() => current!.setLang('sv'))
    expect(screen.getByTestId('mixed').textContent).toBe('Ni är 3 personer i sällskapet')
    act(() => screen.getByTestId('inc').click())
    expect(screen.getByTestId('mixed').textContent).toBe('Ni är 4 personer i sällskapet')
    expect(errors).not.toHaveBeenCalled()
  })
})
