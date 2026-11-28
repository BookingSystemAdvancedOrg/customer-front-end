import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/**
 * How much of the top bar fits on one row, measured instead of guessed with
 * breakpoints. Every part keeps its natural (one-line) width; the header picks
 * the fullest level whose parts fit:
 *
 * 0  name, every tab, full open status, language and theme
 * 1  as 0 with the short status ("Öppet" / "Stängt")
 * 2  name, full status, language, theme and the menu button (tabs in the drawer)
 * 3  as 2 with the short status
 * 4  name, language, theme, menu button (status in the drawer)
 * 5  name and menu button (language and theme in the drawer too)
 *
 * The name may shorten with an ellipsis, but only down to `BRAND_MIN_TEXT`
 * before the next level is taken.
 */
export type HeaderFit = 0 | 1 | 2 | 3 | 4 | 5

export const HEADER_FIT_MAX: HeaderFit = 5

/** Widest the restaurant name may be cut to (px of text) before parts move to the drawer. */
export const BRAND_MIN_TEXT = 180

/**
 * The pill is as wide as the page content (1180 px, `--wrap`), and grows up
 * to `PILL_MAX` on wide screens only when that keeps the tabs in the row
 * (level 1); the long status or the full name never widen it.
 */
export const PILL_BASE = 1180
export const PILL_MAX = 1400

/** Spare room needed before the header goes back to a fuller level (no flip-flop at the edge). */
export const FIT_SLACK = 8

export interface HeaderSizes {
  /** Content width the row can have (inside its padding), with the pill at its widest. */
  available: number
  /** Room for the pill (the header inside its own padding); 0 when unknown. */
  outer?: number
  /** The row's own inline padding. */
  pad?: number
  /** Gap between the row's parts. */
  gap: number
  /** Brand link at its natural width (logo, gap, full name). */
  brand: number
  /** Brand link at the narrowest it may be cut to. */
  brandMin: number
  nav: number
  chipFull: number
  chipShort: number
  /** Language picker and theme toggle together. */
  tools: number
  burger: number
}

/** Width the row needs at a level, with the name at its minimum (or in full with `fullName`). */
export function requiredWidth(level: HeaderFit, s: HeaderSizes, fullName = false): number {
  const parts: number[] = [fullName ? s.brand : s.brandMin]
  if (level <= 1) parts.push(s.nav)
  if (level === 0 || level === 2) parts.push(s.chipFull)
  if (level === 1 || level === 3) parts.push(s.chipShort)
  if (level <= 4) parts.push(s.tools)
  if (level >= 2) parts.push(s.burger)
  const used = parts.filter((w) => w > 0)
  return used.reduce((a, b) => a + b, 0) + s.gap * Math.max(0, used.length - 1)
}

/**
 * Room for the row at the base pill width (`PILL_BASE`, the page content
 * width), or less when the header is narrower. Without a measured header the
 * row's own width is all there is.
 */
export function baseAvailable(s: HeaderSizes): number {
  if (!s.outer) return s.available
  return Math.min(s.available, Math.min(s.outer, PILL_BASE) - (s.pad ?? 0))
}

/** The fullest level that fits in `available`, with the slack and name rules of pickHeaderFit. */
function fullestFit(s: HeaderSizes, available: number, current: HeaderFit, slack: number): HeaderFit {
  const room = (level: HeaderFit) => available - (level < current ? slack : 0)
  for (let level = 0 as HeaderFit; level < HEADER_FIT_MAX; level = (level + 1) as HeaderFit) {
    if (requiredWidth(level, s) > room(level)) continue
    const fullChip = level === 0 || level === 2
    if (fullChip && requiredWidth(level, s, true) > room(level)) {
      const shortChip = (level + 1) as HeaderFit
      if (requiredWidth(shortChip, s) <= room(shortChip)) return shortChip
    }
    return level
  }
  return HEADER_FIT_MAX
}

/**
 * The fullest level that fits. Going back to a fuller level than `current`
 * needs `slack` px to spare, so a width right at an edge does not toggle.
 * Without a real layout (no width, e.g. jsdom or a hidden page) it keeps
 * `current`. The name beats the long status: when the full status only fits
 * by cutting the name, the short status is used instead.
 *
 * Levels are chosen against the base pill (the content width) first, so the
 * header lines up with the page whenever it can. Only when no level with the
 * tabs fits there may the pill grow (up to `PILL_MAX`), and then only for
 * level 1: tabs, the name at its minimum and the short status. It never grows
 * for the long status or the full name.
 */
export function pickHeaderFit(s: HeaderSizes, current: HeaderFit = 0, slack = FIT_SLACK): HeaderFit {
  if (!(s.available > 0)) return current
  const atBase = fullestFit(s, baseAvailable(s), current, slack)
  if (atBase <= 1) return atBase
  const room = s.available - (1 < current ? slack : 0)
  if (requiredWidth(1, s) <= room) return 1
  return atBase
}

const PART_KEYS = ['gap', 'brand', 'brandMin', 'nav', 'chipFull', 'chipShort', 'tools', 'burger'] as const

/** True when any part (not only the room) differs from the last decision, beyond 1 px of rounding. */
export function partsChanged(last: HeaderSizes | null, s: HeaderSizes): boolean {
  if (!last) return true
  return PART_KEYS.some((k) => Math.abs((last[k] ?? 0) - (s[k] ?? 0)) > 1)
}

/**
 * The next level after a measurement. The slack (no flip-flop at an edge)
 * only applies when only the room changed (window width). When a part
 * changed (web font arrived, language switched, new status, new tabs) the
 * level is decided afresh, so the same width and content always give the
 * same level, whatever came before.
 */
export function nextHeaderFit(s: HeaderSizes, last: HeaderSizes | null, current: HeaderFit): HeaderFit {
  return pickHeaderFit(s, current, partsChanged(last, s) ? 0 : FIT_SLACK)
}

/**
 * The next level for sizes measured while `applied` was on screen. Some
 * parts measure a little differently per level (a hidden menu button, the nav
 * in a wider pill), so a part only counts as changed against a measurement
 * taken at the same level. A real change (web font, language, status, tabs)
 * clears what is remembered and is decided afresh; a level change alone keeps
 * the slack, so a level-dependent measurement cannot flip-flop at an edge.
 */
export function decideHeaderFit(s: HeaderSizes, applied: HeaderFit, memory: Map<HeaderFit, HeaderSizes>): HeaderFit {
  if (!(s.available > 0)) return applied
  const same = memory.get(applied)
  // first measurement ever: fresh; first at this level: compare with itself (slack kept)
  const last = same ?? (memory.size > 0 ? s : null)
  if (partsChanged(last, s)) memory.clear()
  memory.set(applied, s)
  return nextHeaderFit(s, last, applied)
}

/**
 * Pill width for a level: the base width, wider (up to the room there is)
 * only when level 1 needs it, with the name at its minimum and the short status.
 */
export function pillWidth(level: HeaderFit, s: HeaderSizes): number | null {
  if (!s.outer) return null
  const need = level === 1 ? requiredWidth(1, s) + (s.pad ?? 0) : 0
  return Math.round(Math.min(s.outer, PILL_MAX, Math.max(PILL_BASE, need)))
}

export interface HeaderFitRefs {
  /** The sticky header around the pill; without it the row's own width is used. */
  header?: RefObject<HTMLElement | null>
  row: RefObject<HTMLElement | null>
  brand: RefObject<HTMLElement | null>
  wordmark: RefObject<HTMLElement | null>
  navList: RefObject<HTMLElement | null>
  chip: RefObject<HTMLElement | null>
  chipFull: RefObject<HTMLElement | null>
  chipShort: RefObject<HTMLElement | null>
  tools: RefObject<HTMLElement | null>
  burger: RefObject<HTMLElement | null>
}

const width = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().width : 0)
const px = (v: string | undefined) => {
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : 0
}

/** Reads the natural sizes of the parts. Parts the current level hides stay measurable (see site.css). */
export function measureHeader(r: HeaderFitRefs): HeaderSizes {
  const row = r.row.current
  const cs = row ? getComputedStyle(row) : null
  const pad = px(cs?.paddingLeft) + px(cs?.paddingRight)
  const header = r.header?.current
  let outer = 0
  if (header) {
    const hs = getComputedStyle(header)
    outer = header.clientWidth - px(hs.paddingLeft) - px(hs.paddingRight)
  }
  // with the header known, measure against the widest the pill may get, not
  // against its current width (which depends on the level: no loop)
  let available = outer > 0 ? Math.min(outer, PILL_MAX) - pad : row ? row.clientWidth - pad : 0
  // something else keeps the row narrower than the pill width it was given
  // (a site's own CSS): trust the row then
  const given = header ? px(header.style.getPropertyValue('--header-pill')) : 0
  if (row && given > 0 && row.clientWidth < Math.min(outer, given) - 1) available = row.clientWidth - pad
  const gap = px(cs?.columnGap)

  const brandEl = r.brand.current
  const word = r.wordmark.current
  const wordNatural = word ? Math.max(word.scrollWidth, width(word)) : 0
  const brandRest = Math.max(0, width(brandEl) - width(word))
  const brand = brandRest + wordNatural
  const brandMin = brandRest + Math.min(wordNatural, BRAND_MIN_TEXT)

  const nav = r.navList.current ? Math.max(r.navList.current.scrollWidth, width(r.navList.current)) : 0

  const chipEl = r.chip.current
  const full = width(r.chipFull.current)
  const short = width(r.chipShort.current)
  // exactly one of the two texts is in the flow; the other is laid out apart
  const inFlow = chipEl?.classList.contains('open-chip--short') ? short : full
  const chipBase = Math.max(0, width(chipEl) - inFlow)
  const chipFull = chipEl ? chipBase + full : 0
  const chipShort = chipEl ? chipBase + short : 0

  const tools = width(r.tools.current)
  const burgerEl = r.burger.current
  let burger = 0
  if (burgerEl) {
    const bs = getComputedStyle(burgerEl)
    burger = width(burgerEl) + px(bs.marginLeft) + px(bs.marginRight)
  }

  // +1 per part: widths are fractional, and a part that is 0.4 px too wide still wraps
  return {
    available,
    outer: Math.max(0, outer),
    pad,
    gap,
    brand: Math.ceil(brand),
    brandMin: Math.ceil(brandMin) + 1,
    nav: Math.ceil(nav) + 1,
    chipFull: Math.ceil(chipFull) + 1,
    chipShort: Math.ceil(chipShort) + 1,
    tools: Math.ceil(tools) + 1,
    burger: Math.ceil(burger),
  }
}

/**
 * Keeps the header's level in step with its real sizes: decided before the
 * first paint (layout effect), and again whenever the row or any part changes
 * size (window width, fonts, a translated label, a new status text).
 * Every part stays measurable, and a part change that only follows a level
 * change keeps the slack (decideHeaderFit), so it cannot loop.
 */
export function useHeaderFit(refs: HeaderFitRefs, contentKey: string): HeaderFit {
  const [fit, setFit] = useState<HeaderFit>(0)
  const fitRef = useRef<HeaderFit>(0)
  const refsRef = useRef(refs)
  refsRef.current = refs
  const memoryRef = useRef(new Map<HeaderFit, HeaderSizes>())

  const decide = () => {
    const s = measureHeader(refsRef.current)
    const next = decideHeaderFit(s, fitRef.current, memoryRef.current)
    return { s, next }
  }

  // content changed (tabs, name, status): decide again before paint
  const applyPill = (level: HeaderFit, s: HeaderSizes) => {
    const header = refsRef.current.header?.current
    const w = pillWidth(level, s)
    if (header) {
      if (w === null) header.style.removeProperty('--header-pill')
      else header.style.setProperty('--header-pill', `${w}px`)
    }
  }

  useLayoutEffect(() => {
    const { s, next } = decide()
    applyPill(next, s)
    if (next !== fitRef.current) {
      fitRef.current = next
      setFit(next)
    }
  }, [contentKey])

  useLayoutEffect(() => {
    const r = refsRef.current
    const els = [r.header, r.row, r.wordmark, r.navList, r.chipFull, r.chipShort, r.tools]
      .map((x) => x?.current)
      .filter((x): x is HTMLElement => !!x)
    let mounted = true
    const update = () => {
      if (!mounted) return
      const { s, next } = decide()
      applyPill(next, s)
      if (next === fitRef.current) return
      fitRef.current = next
      // inside the observer callback, before paint: no frame with the old level
      flushSync(() => setFit(next))
    }
    const ro = new ResizeObserver(update)
    els.forEach((el) => ro.observe(el))
    // web fonts change every part's width: measure again once they are in
    // (the observer usually sees it too). Only parts that really changed
    // reset the slack, so a later font for a drawer or modal moves nothing.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    const onFonts = () => update()
    fonts?.addEventListener?.('loadingdone', onFonts)
    fonts?.ready?.then(onFonts).catch(() => {})
    return () => {
      mounted = false
      ro.disconnect()
      fonts?.removeEventListener?.('loadingdone', onFonts)
    }
  }, [])

  return fit
}
