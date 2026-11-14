import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type FormEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select, SELECT_SHEET_QUERY, type SelectItem } from './Select'

const FRUIT: SelectItem[] = [
  { value: 'apple', label: 'Äpple' },
  { value: 'banana', label: 'Banan' },
  { value: 'blueberry', label: 'Blåbär', disabled: true },
  { value: 'cherry', label: 'Körsbär' },
  { value: 'citron', label: 'Citron' },
]

function Fruit({ initial = 'apple', onChange = () => {}, ...rest }: { initial?: string; onChange?: (v: string) => void } & Partial<Parameters<typeof Select>[0]>) {
  const [v, setV] = useState(initial)
  return (
    <>
      <label htmlFor="fruit">Frukt</label>
      <Select id="fruit" value={v} options={FRUIT} onChange={(x) => { setV(x); onChange(x) }} {...rest} />
      <button type="button">Efter</button>
    </>
  )
}

function mockMatchMedia(phone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q === SELECT_SHEET_QUERY ? phone : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia; tests add it themselves
  delete window.matchMedia
  vi.restoreAllMocks()
})

describe('Select', () => {
  it('is a labelled combobox showing the current value, list closed', () => {
    render(<Fruit />)
    const box = screen.getByRole('combobox', { name: 'Frukt' })
    expect(box).toHaveTextContent('Äpple')
    expect(box).toHaveAttribute('aria-expanded', 'false')
    expect(box).toHaveAttribute('aria-haspopup', 'listbox')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens with a click into a portal in body, marks the selected option and picks another', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<Fruit onChange={onChange} />)
    const box = screen.getByRole('combobox', { name: 'Frukt' })
    await user.click(box)
    const list = screen.getByRole('listbox', { name: 'Frukt' })
    expect(container.contains(list)).toBe(false)
    expect(document.body.contains(list)).toBe(true)
    expect(box).toHaveAttribute('aria-expanded', 'true')
    expect(box).toHaveAttribute('aria-controls', list.id)
    expect(within(list).getByRole('option', { name: 'Äpple' })).toHaveAttribute('aria-selected', 'true')
    expect(within(list).getByRole('option', { name: 'Blåbär' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(within(list).getByRole('option', { name: 'Körsbär' }))
    expect(onChange).toHaveBeenCalledWith('cherry')
    expect(box).toHaveTextContent('Körsbär')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box).toHaveFocus()
  })

  it('ignores a click on a disabled option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Blåbär' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('works by keyboard: arrows skip disabled, Home/End, Enter picks, focus stays on the combobox', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    const box = screen.getByRole('combobox')
    box.focus()
    await user.keyboard('{ArrowDown}')
    const active = () => document.getElementById(box.getAttribute('aria-activedescendant') ?? '')
    expect(active()).toHaveTextContent('Äpple')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(active()).toHaveTextContent('Körsbär')
    await user.keyboard('{End}')
    expect(active()).toHaveTextContent('Citron')
    await user.keyboard('{Home}')
    expect(active()).toHaveTextContent('Äpple')
    await user.keyboard('{ArrowUp}')
    expect(active()).toHaveTextContent('Äpple')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('banana')
    expect(box).toHaveFocus()
    expect(box).not.toHaveAttribute('aria-activedescendant')
  })

  it('opens with Space and Alt+ArrowDown; Escape closes without a change and keeps focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Fruit onChange={onChange} />)
    const box = screen.getByRole('combobox')
    box.focus()
    await user.keyboard(' ')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(box).toHaveFocus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('Escape inside a dialog closes only the list', async () => {
    const user = userEvent.setup()
    const onKey = vi.fn()
    render(<div onKeyDown={(e) => e.key === 'Escape' && onKey()}><Fruit /></div>)
    await user.click(screen.getByRole('combobox'))
    await user.keyboard('{Escape}')
    expect(onKey).not.toHaveBeenCalled()
  })

  it('Tab closes the list and moves on', async () => {
    const user = userEvent.setup()
    render(<Fruit />)
    await user.click(screen.getByRole('combobox'))
    await user.tab()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Efter' })).toHaveFocus()
  })

  it('typeahead: a letter opens on the next match, skipping disabled; letters typed together match a word', async () => {
    const user = userEvent.setup()
    const wait = () => new Promise((r) => setTimeout(r, 650))
    render(<Fruit />)
    const box = screen.getByRole('combobox')
    box.focus()
    const active = () => document.getElementById(box.getAttribute('aria-activedescendant') ?? '')
    await user.keyboard('c')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(active()).toHaveTextContent('Citron')
    await wait()
    await user.keyboard('b')
    expect(active()).toHaveTextContent('Banan')
    await wait()
    await user.keyboard('b')
    expect(active()).toHaveTextContent('Banan') // Blåbär is disabled, so b stays on Banan
    await wait()
    await user.keyboard('kö')
    expect(active()).toHaveTextContent('Körsbär')
    await user.keyboard('{Enter}')
    expect(box).toHaveTextContent('Körsbär')
  })

  it('closes on an outside click and when the page scrolls', async () => {
    const user = userEvent.setup()
    render(<Fruit />)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('button', { name: 'Efter' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    await user.click(screen.getByRole('combobox'))
    const list = screen.getByRole('listbox')
    fireEvent.scroll(list)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.scroll(window)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('places the list under the trigger and flips above when there is no room below', async () => {
    const user = userEvent.setup()
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200)
    render(<Fruit />)
    const box = screen.getByRole('combobox')
    const rect = (top: number) => ({ top, bottom: top + 44, left: 20, right: 220, width: 200, height: 44, x: 20, y: top, toJSON() {} })
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(rect(100) as DOMRect)
    await user.click(box)
    let pop = screen.getByRole('listbox').parentElement as HTMLElement
    expect(pop).toHaveClass('combo-pop--below')
    expect(pop.style.top).toBe('150px')
    expect(pop.style.left).toBe('20px')
    expect(pop.style.width).toBe('200px')
    await user.keyboard('{Escape}')

    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(rect(window.innerHeight - 60) as DOMRect)
    await user.click(box)
    pop = screen.getByRole('listbox').parentElement as HTMLElement
    expect(pop).toHaveClass('combo-pop--above')
    expect(parseFloat(pop.style.top)).toBe(window.innerHeight - 60 - 6 - 200)
  })

  it('keeps the list inside the window horizontally', async () => {
    const user = userEvent.setup()
    render(<Fruit />)
    const box = screen.getByRole('combobox')
    const w = window.innerWidth
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 54, left: w - 50, right: w + 150, width: 200, height: 44, x: w - 50, y: 10, toJSON() {} } as DOMRect)
    await user.click(box)
    const pop = screen.getByRole('listbox').parentElement as HTMLElement
    expect(parseFloat(pop.style.left) + 200).toBeLessThanOrEqual(w - 8)
  })

  it('on a phone opens a sheet with a title and a backdrop that closes it', async () => {
    mockMatchMedia(true)
    const user = userEvent.setup()
    render(<Fruit />)
    await user.click(screen.getByRole('combobox'))
    const pop = screen.getByRole('listbox').parentElement as HTMLElement
    expect(pop).toHaveClass('combo-pop--sheet')
    expect(pop.style.top).toBe('')
    expect(within(pop).getByText('Frukt')).toBeInTheDocument()
    fireEvent.scroll(window)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.click(document.querySelector('.combo-backdrop') as HTMLElement)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('on a wide screen opens a popover, not a sheet', async () => {
    mockMatchMedia(false)
    const user = userEvent.setup()
    render(<Fruit />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox').parentElement).not.toHaveClass('combo-pop--sheet')
  })

  it('renders optgroups as labelled groups', async () => {
    const user = userEvent.setup()
    render(
      <Select aria-label="Plats" value="b" onChange={() => {}} options={[
        { group: 'Stockholm', options: [{ value: 'a', label: 'City' }, { value: 'b', label: 'Söder' }] },
        { group: 'Göteborg', options: [{ value: 'c', label: 'Haga' }] },
      ]} />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Plats' }))
    const group = screen.getByRole('group', { name: 'Göteborg' })
    expect(within(group).getByRole('option', { name: 'Haga' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Söder' })).toHaveAttribute('aria-selected', 'true')
  })

  it('sends its value with the form and blocks submit while a required value is missing', async () => {
    const user = userEvent.setup()
    const submit = vi.fn((e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      return new FormData(e.currentTarget).get('fruit')
    })
    function F() {
      const [v, setV] = useState('')
      return (
        <form onSubmit={submit}>
          <label htmlFor="f">Frukt</label>
          <Select id="f" name="fruit" required value={v} onChange={setV} placeholder="Välj frukt" options={FRUIT} />
          <button type="submit">Skicka</button>
        </form>
      )
    }
    render(<F />)
    const box = screen.getByRole('combobox', { name: 'Frukt' })
    expect(box).toHaveTextContent('Välj frukt')
    expect(box).toHaveAttribute('aria-required', 'true')
    const native = document.querySelector('input[name="fruit"]') as HTMLInputElement
    expect(native.checkValidity()).toBe(false)
    await user.click(box)
    await user.click(screen.getByRole('option', { name: 'Banan' }))
    expect(native.value).toBe('banana')
    expect(native.checkValidity()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Skicka' }))
    expect(submit).toHaveReturnedWith('banana')
    act(() => native.focus())
    expect(box).toHaveFocus()
  })

  it('passes invalid and described-by to the combobox and does nothing when disabled', async () => {
    const user = userEvent.setup()
    render(<Fruit aria-invalid aria-describedby="err" disabled />)
    const box = screen.getByRole('combobox')
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAttribute('aria-describedby', 'err')
    expect(box).toBeDisabled()
    await user.click(box)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens inside an open dialog so the list is in the top layer', async () => {
    const user = userEvent.setup()
    render(<dialog open><Fruit /></dialog>)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox').closest('dialog')).not.toBeNull()
  })
})
