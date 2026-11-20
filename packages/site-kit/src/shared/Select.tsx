import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Rullista i Booqys look i stället för systemets meny (WAI-ARIA "select-only
 * combobox"): en knapp med det valda värdet och en lista i en portal under
 * knappen (ovanför när det inte får plats). På telefon ett ark nerifrån med
 * stora rader, aldrig iOS-hjulet.
 *
 * Tangentbord: Enter, mellanslag, pil ner/upp och Alt+pil ner öppnar; pilar,
 * Home/End och PageUp/PageDown flyttar; bokstäver hoppar till ett alternativ;
 * Enter/mellanslag väljer; Escape stänger och fokus stannar på knappen; Tab
 * stänger. Fokus ligger kvar på knappen (aria-activedescendant).
 *
 * Med name eller required följer ett dolt fält med i formuläret, så att
 * formulärdata och webbläsarens egen kontroll av required fungerar.
 */

export type SelectOption = { value: string; label: ReactNode; text?: string; disabled?: boolean }
export type SelectGroup = { group: string; options: SelectOption[] }
export type SelectItem = SelectOption | SelectGroup

export type SelectProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectItem[]
  /** Visas när värdet inte finns bland alternativen (t.ex. "Välj ämne"). */
  placeholder?: string
  name?: string
  required?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  /** Visas i knappen i stället för det valda alternativets label (t.ex. flagga + kod). */
  valueLabel?: ReactNode
  /** Listans namn och arkets rubrik, om de ska skilja sig från knappens namn. */
  listLabel?: string
  /** Listan översätts aldrig (translate="no" på portalen), t.ex. språkväljaren. */
  noTranslate?: boolean
  /** Listans kant mot knappens början (standard) eller slut (t.ex. längst till höger i sidhuvudet). */
  align?: 'start' | 'end'
  /** Listans minsta bredd i px (standard 160), när knappen är smalare än raderna. */
  minListWidth?: number
}

/** Smalare än så här: arket nerifrån i stället för en lista under knappen. */
export const SELECT_SHEET_QUERY = '(max-width: 599px)'
const GAP = 6
const EDGE = 8
const MAX_H = 320
const TYPE_RESET_MS = 600

const isGroup = (i: SelectItem): i is SelectGroup => 'group' in i
const flatten = (items: SelectItem[]) => items.flatMap((i) => (isGroup(i) ? i.options : [i]))
const textOf = (o: SelectOption) =>
  o.text ?? (typeof o.label === 'string' || typeof o.label === 'number' ? String(o.label) : o.value)

function CheckIcon() {
  return (
    <svg className="combo-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg className="combo-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** Etikettens text utan knappens eget värde (när knappen ligger inuti <label>). */
function labelText(t: HTMLButtonElement | null): string {
  const label = t?.labels?.[0]
  if (!label || !t) return ''
  if (!label.contains(t)) return label.textContent ?? ''
  const copy = label.cloneNode(true) as HTMLElement
  copy.querySelectorAll('.combo-field, .combo').forEach((n) => n.remove())
  return copy.textContent ?? ''
}

type Place = { top: number; left: number; width: number; maxHeight: number; above: boolean }

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  name,
  required,
  disabled,
  className,
  valueLabel,
  listLabel,
  noTranslate,
  align = 'start',
  minListWidth = 160,
  ...aria
}: SelectProps) {
  const baseId = useId()
  const listId = `${baseId}-list`
  const flat = flatten(options)
  const selectedIndex = flat.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? flat[selectedIndex] : null

  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState<Place | null>(null)
  const [title, setTitle] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })

  const enabled = (i: number) => i >= 0 && i < flat.length && !flat[i].disabled
  function step(from: number, dir: 1 | -1, count = 1): number {
    let at = from
    let moved = from
    for (let n = 0; n < count; n++) {
      let i = at + dir
      while (i >= 0 && i < flat.length && !enabled(i)) i += dir
      if (!enabled(i)) break
      at = i
      moved = i
    }
    return moved
  }
  const first = () => step(-1, 1)
  const last = () => step(flat.length, -1)

  function openList(at: number) {
    if (disabled || !flat.length) return
    const t = trigger.current
    const labelled = aria['aria-labelledby']
      ?.split(/\s+/)
      .map((x) => document.getElementById(x)?.textContent ?? '')
      .join(' ')
    setTitle((listLabel || labelled || labelText(t) || aria['aria-label'] || '').trim())
    setSheet(typeof window.matchMedia === 'function' && window.matchMedia(SELECT_SHEET_QUERY).matches)
    setPlace(null)
    setActive(enabled(at) ? at : first())
    setOpen(true)
    // Safari fokuserar inte en knapp vid klick: utan fokus når tangenterna inte listan.
    if (t && document.activeElement !== t) t.focus({ preventScroll: true })
  }

  function close(refocus: boolean) {
    setOpen(false)
    setActive(-1)
    if (refocus) trigger.current?.focus()
  }

  function choose(i: number) {
    if (!enabled(i)) return
    if (flat[i].value !== value) onChange(flat[i].value)
    close(true)
  }

  /** Bokstäver: hoppa till nästa alternativ som börjar så. Samma bokstav igen bläddrar. */
  function typeahead(ch: string, from: number): number {
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at > TYPE_RESET_MS ? ch : t.text + ch
    t.at = now
    const q = t.text.toLocaleLowerCase('sv')
    const same = q.length > 1 && [...q].every((c) => c === q[0])
    const needle = same ? q[0] : q
    const start = same || q.length === 1 ? from + 1 : Math.max(from, 0)
    for (let n = 0; n < flat.length; n++) {
      const i = (start + n) % flat.length
      if (enabled(i) && textOf(flat[i]).toLocaleLowerCase('sv').startsWith(needle)) return i
    }
    return from
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const k = e.key
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        e.preventDefault()
        openList(selectedIndex)
      } else if (k === 'Home' || k === 'End') {
        e.preventDefault()
        openList(k === 'Home' ? first() : last())
      } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        openList(typeahead(k, selectedIndex))
      }
      return
    }
    if (k === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (k === 'Tab') {
      close(false)
    } else if (k === 'ArrowUp' && e.altKey) {
      e.preventDefault()
      choose(active)
    } else if (k === 'Enter' || (k === ' ' && !(typed.current.text && Date.now() - typed.current.at < TYPE_RESET_MS))) {
      e.preventDefault()
      choose(active)
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault()
      setActive(step(active, k === 'ArrowDown' ? 1 : -1))
    } else if (k === 'PageDown' || k === 'PageUp') {
      e.preventDefault()
      setActive(step(active, k === 'PageDown' ? 1 : -1, 10))
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault()
      setActive(k === 'Home' ? first() : last())
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      setActive(typeahead(k, active))
    }
  }

  // Placera listan: under knappen, ovanför om det är trångt under, alltid inom fönstret.
  useLayoutEffect(() => {
    if (!open || sheet) return
    function measure() {
      const t = trigger.current
      const l = list.current
      const p = pop.current
      if (!t || !l || !p) return
      const r = t.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      // Rutans egen utfyllnad och kant: rutan är så mycket högre än listan.
      const cs = window.getComputedStyle(p)
      const px = (v: string) => parseFloat(v) || 0
      const chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth)
      const want = Math.min(l.scrollHeight || MAX_H, MAX_H)
      const below = vh - r.bottom - GAP - EDGE
      const above = r.top - GAP - EDGE
      const up = below < want + chrome && above > below
      const maxHeight = Math.max(96, Math.min(MAX_H, (up ? above : below) - chrome))
      const width = Math.min(Math.max(r.width, minListWidth), vw - EDGE * 2)
      // Höger till vänster: listans början är knappens högra kant.
      const rtl = cs.direction === 'rtl'
      const fromRight = (align === 'end') !== rtl
      const left = Math.min(Math.max(fromRight ? r.right - width : r.left, EDGE), vw - width - EDGE)
      const top = up ? r.top - GAP - (Math.min(want, maxHeight) + chrome) : r.bottom + GAP
      setPlace({ top, left, width, maxHeight, above: up })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet])

  // Arket nerifrån: sidan under står still (roten låses, inte body, som menyn).
  useEffect(() => {
    if (!open || !sheet) return
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = prev
    }
  }, [open, sheet])

  // Stäng vid klick utanför och när sidan (eller en förälder) rullar.
  useEffect(() => {
    if (!open) return
    function outside(e: PointerEvent) {
      const n = e.target
      if (!(n instanceof Element)) return
      if (trigger.current?.contains(n) || pop.current?.contains(n) || n.classList.contains('combo-backdrop')) return
      close(false)
    }
    function scrolled(e: Event) {
      if (sheet || (e.target instanceof Node && pop.current?.contains(e.target))) return
      close(false)
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', scrolled, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('scroll', scrolled, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet])

  // Det aktiva alternativet syns alltid i listan (bara listan rullar, aldrig sidan).
  useLayoutEffect(() => {
    const l = list.current
    if (!open || !l || active < 0) return
    const el = l.querySelector<HTMLElement>(`[data-index="${active}"]`)
    if (!el) return
    const top = el.offsetTop - l.offsetTop
    if (top < l.scrollTop) l.scrollTop = top
    else if (top + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = top + el.offsetHeight - l.clientHeight
  }, [open, active, place])

  const optId = (i: number) => `${baseId}-o${i}`
  let index = -1
  const renderOption = (o: SelectOption) => {
    const i = ++index
    const isSel = i === selectedIndex
    return (
      <div
        key={`${o.value}-${i}`}
        id={optId(i)}
        role="option"
        data-index={i}
        aria-selected={isSel}
        aria-disabled={o.disabled || undefined}
        className={`combo-option${i === active ? ' is-active' : ''}${isSel ? ' is-selected' : ''}`}
        onPointerMove={() => !o.disabled && i !== active && setActive(i)}
        onClick={() => choose(i)}
      >
        <span className="combo-option-label">{o.label}</span>
        {isSel ? <CheckIcon /> : null}
      </div>
    )
  }

  // Inuti en öppen <dialog> (översta lagret) måste listan ligga i dialogen för att synas.
  const host = (open && (trigger.current?.closest('dialog[open]') as HTMLElement | null)) || (typeof document !== 'undefined' ? document.body : null)

  const popup = open && host
    ? createPortal(
        <>
          {sheet ? <div className="combo-backdrop" aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={() => close(true)} /> : null}
          <div
            ref={pop}
            className={`combo-pop ${sheet ? 'combo-pop--sheet' : place?.above ? 'combo-pop--above' : 'combo-pop--below'}`}
            style={sheet ? undefined : place ? { top: place.top, left: place.left, width: place.width } : { top: 0, left: 0, visibility: 'hidden' }}
            onMouseDown={(e) => e.preventDefault()}
            translate={noTranslate ? 'no' : undefined}
          >
            {sheet && title ? <p className="combo-title" aria-hidden="true">{title}</p> : null}
            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-label={title || undefined}
              tabIndex={-1}
              className="combo-list"
              style={sheet || !place ? undefined : { maxHeight: place.maxHeight }}
            >
              {options.map((item, g) =>
                isGroup(item) ? (
                  <div key={`g${g}`} role="group" aria-labelledby={`${baseId}-g${g}`} className="combo-group">
                    <div id={`${baseId}-g${g}`} role="presentation" className="combo-group-label">{item.group}</div>
                    {item.options.map(renderOption)}
                  </div>
                ) : (
                  renderOption(item)
                ),
              )}
            </div>
          </div>
        </>,
        host,
      )
    : null

  const button = (
    <button
      ref={trigger}
      id={id}
      type="button"
      role="combobox"
      className={`combo${className ? ` ${className}` : ''}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
      aria-required={required || undefined}
      aria-invalid={aria['aria-invalid'] || undefined}
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      aria-describedby={aria['aria-describedby']}
      data-placeholder={selected ? undefined : ''}
      disabled={disabled}
      onClick={() => (open ? close(true) : openList(selectedIndex))}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && !pop.current?.contains(e.relatedTarget as Node | null)) close(false)
      }}
    >
      <span className="combo-value">{selected ? (valueLabel ?? selected.label) : placeholder ?? ''}</span>
      <Chevron />
    </button>
  )

  if (!name && !required) return <>{button}{popup}</>
  return (
    <span className="combo-field">
      {button}
      <input
        className="combo-native"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        required={required}
        disabled={disabled}
        value={selected ? value : ''}
        onChange={() => {}}
        onFocus={() => trigger.current?.focus()}
      />
      {popup}
    </span>
  )
}
