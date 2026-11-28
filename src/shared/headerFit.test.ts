import { describe, expect, it } from 'vitest'
import { BRAND_MIN_TEXT, FIT_SLACK, PILL_BASE, PILL_MAX, measureHeader, nextHeaderFit, partsChanged, pickHeaderFit, pillWidth, requiredWidth, type HeaderSizes } from './headerFit'

// Restaurant 1 with seven tabs, roughly the sizes in the owner's screenshot
const sizes = (available: number, over: Partial<HeaderSizes> = {}): HeaderSizes => ({
  available,
  gap: 20,
  brand: 170,
  brandMin: 170,
  nav: 640,
  chipFull: 190,
  chipShort: 90,
  tools: 120,
  burger: 36,
  ...over,
})

describe('requiredWidth', () => {
  it('adds the parts of each level and one gap between each', () => {
    const s = sizes(0)
    expect(requiredWidth(0, s)).toBe(170 + 640 + 190 + 120 + 3 * 20)
    expect(requiredWidth(1, s)).toBe(170 + 640 + 90 + 120 + 3 * 20)
    expect(requiredWidth(2, s)).toBe(170 + 190 + 120 + 36 + 3 * 20)
    expect(requiredWidth(3, s)).toBe(170 + 90 + 120 + 36 + 3 * 20)
    expect(requiredWidth(4, s)).toBe(170 + 120 + 36 + 2 * 20)
    expect(requiredWidth(5, s)).toBe(170 + 36 + 20)
  })

  it('leaves out parts with no width (e.g. no language picker) and their gap', () => {
    expect(requiredWidth(4, sizes(0, { tools: 0 }))).toBe(170 + 36 + 20)
  })
})

describe('pickHeaderFit', () => {
  it('shows everything when it fits', () => {
    expect(pickHeaderFit(sizes(1400))).toBe(0)
  })

  it('shortens the status before it hides any tab', () => {
    expect(pickHeaderFit(sizes(1100))).toBe(1)
  })

  it('moves the tabs to the drawer when they do not fit, at the width in the screenshot', () => {
    // 1180 px pill minus 32 px padding: the old header wrapped "Boka bord" here
    expect(pickHeaderFit(sizes(1148, { nav: 900 }))).toBe(2)
  })

  it('then shortens the status, then hides it, then language and theme', () => {
    expect(pickHeaderFit(sizes(500))).toBe(3)
    expect(pickHeaderFit(sizes(390))).toBe(4)
    expect(pickHeaderFit(sizes(300))).toBe(5)
    expect(pickHeaderFit(sizes(100))).toBe(5)
  })

  it('does not toggle at the edge: a fuller level needs slack px to spare', () => {
    const edge = requiredWidth(0, sizes(0))
    expect(pickHeaderFit(sizes(edge), 0)).toBe(0)
    expect(pickHeaderFit(sizes(edge), 1)).toBe(1)
    expect(pickHeaderFit(sizes(edge + FIT_SLACK), 1)).toBe(0)
    expect(pickHeaderFit(sizes(edge - 1), 0)).toBe(1)
  })

  it('shows the short status rather than cut the name for the long one', () => {
    // a long name: everything fits only with the name cut to its minimum
    const long = sizes(1250, { brand: 600, brandMin: 200 })
    expect(requiredWidth(0, long)).toBeLessThanOrEqual(1250)
    expect(pickHeaderFit(long)).toBe(1)
    // phone/tablet row: same choice between full and short status
    expect(requiredWidth(2, sizes(0, { brandMin: 200 }))).toBeLessThanOrEqual(620)
    expect(pickHeaderFit(sizes(620, { brand: 600, brandMin: 200 }))).toBe(3)
    // a short name keeps the full status
    expect(pickHeaderFit(sizes(1250))).toBe(0)
  })

  it('keeps the level without a real layout (jsdom, hidden tab)', () => {
    expect(pickHeaderFit(sizes(0), 3)).toBe(3)
  })

  it('works for any number of tabs and long labels (English, Spanish)', () => {
    for (let tabs = 1; tabs <= 10; tabs++) {
      const nav = tabs * 110
      const level = pickHeaderFit(sizes(1148, { nav }))
      const fits = requiredWidth(level, sizes(1148, { nav })) <= 1148
      expect(fits).toBe(true)
      if (level >= 2) expect(requiredWidth(1, sizes(1148, { nav }))).toBeGreaterThan(1148)
    }
  })
})

describe('nextHeaderFit', () => {
  // level 0 needs 170 + 640 + 190 + 120 + 60 = 1180; 1184 leaves 4 px, less than the slack
  const edge = 1184

  it('keeps the slack when only the width changed', () => {
    const last = sizes(1170)
    expect(nextHeaderFit(sizes(edge), last, 1)).toBe(1)
  })

  it('decides afresh when the parts got narrower at the same width (web font, language back)', () => {
    const wide = sizes(edge, { nav: 660 })
    const narrow = sizes(edge)
    expect(partsChanged(wide, narrow)).toBe(true)
    expect(nextHeaderFit(narrow, wide, 1)).toBe(0)
  })

  it('gives the same level for the same width and parts, whatever came before', () => {
    const direct = nextHeaderFit(sizes(edge), null, 0)
    const viaWider = nextHeaderFit(sizes(edge), sizes(edge, { nav: 700, chipFull: 230 }), 2)
    expect(viaWider).toBe(direct)
  })

  it('ignores 1 px of rounding in a part', () => {
    expect(partsChanged(sizes(edge), sizes(edge, { nav: 641 }))).toBe(false)
  })
})

describe('pillWidth', () => {
  it('stays at the base width when the parts fit in it', () => {
    expect(pillWidth(2, sizes(1368, { outer: 1872, pad: 32 }))).toBe(PILL_BASE)
    expect(pillWidth(0, sizes(1368, { outer: 1872, pad: 32 }))).toBe(PILL_BASE)
  })

  it('grows on a wide screen only as far as level 1 needs, never past PILL_MAX or the room', () => {
    const s = sizes(1368, { outer: 1872, pad: 32, nav: 900 })
    expect(pillWidth(1, s)).toBe(170 + 900 + 90 + 120 + 3 * 20 + 32)
    expect(pillWidth(1, sizes(1368, { outer: 1872, pad: 32, nav: 2000 }))).toBe(PILL_MAX)
    expect(pillWidth(0, sizes(800, { outer: 832, pad: 32 }))).toBe(832)
  })

  it('never widens for the long status or the full name', () => {
    const s = sizes(1368, { outer: 1872, pad: 32, nav: 900, brand: 400, chipFull: 300 })
    expect(pillWidth(0, s)).toBe(PILL_BASE)
    expect(pillWidth(2, s)).toBe(PILL_BASE)
    expect(pillWidth(1, s)).toBe(170 + 900 + 90 + 120 + 3 * 20 + 32)
  })

  it('is left to the CSS without a measured header', () => {
    expect(pillWidth(0, sizes(1000))).toBeNull()
  })
})

describe('pickHeaderFit with a measured header (pill at the content width first)', () => {
  // Restaurant 1 with eight tabs at 1440 px: outer 1392, row padding 32
  const r1 = (over: Partial<HeaderSizes> = {}) =>
    sizes(Math.min(1392, PILL_MAX) - 32, { outer: 1392, pad: 32, brand: 150, brandMin: 150, nav: 700, chipFull: 230, chipShort: 90, tools: 120, ...over })

  it('takes level 1 in the content width rather than level 0 in a wider pill', () => {
    const s = r1()
    expect(requiredWidth(0, s, true) + 32).toBeGreaterThan(PILL_BASE)
    expect(requiredWidth(1, s) + 32).toBeLessThanOrEqual(PILL_BASE)
    const level = pickHeaderFit(s)
    expect(level).toBe(1)
    expect(pillWidth(level, s)).toBe(PILL_BASE)
    expect(pillWidth(level, s)!).toBeLessThanOrEqual(Math.max(PILL_BASE, requiredWidth(1, s) + 32))
  })

  it('keeps level 0 when it fits in the content width', () => {
    const s = r1({ nav: 500 })
    expect(pickHeaderFit(s)).toBe(0)
    expect(pillWidth(0, s)).toBe(PILL_BASE)
  })

  it('grows only for level 1 when no tab level fits in the content width', () => {
    const s = r1({ nav: 900 })
    expect(requiredWidth(1, s) + 32).toBeGreaterThan(PILL_BASE)
    expect(pickHeaderFit(s)).toBe(1)
    expect(pillWidth(1, s)).toBe(requiredWidth(1, s) + 32)
    // too many tabs even for PILL_MAX: the drawer
    expect(pickHeaderFit(r1({ nav: 1300 }))).toBeGreaterThanOrEqual(2)
    expect(pillWidth(pickHeaderFit(r1({ nav: 1300 })), r1({ nav: 1300 }))).toBe(PILL_BASE)
  })

  it('a long name never makes the pill wider', () => {
    const s = r1({ brand: 700, brandMin: 210 })
    const level = pickHeaderFit(s)
    expect(pillWidth(level, s)!).toBeLessThanOrEqual(Math.max(PILL_BASE, requiredWidth(1, s) + 32))
  })

  it('uses the header width when it is narrower than the content width', () => {
    const s = sizes(1000 - 32, { outer: 1000, pad: 32, nav: 900 })
    expect(pickHeaderFit(s)).toBeGreaterThanOrEqual(2)
    expect(pillWidth(2, s)).toBe(1000)
  })
})

describe('measureHeader', () => {
  function el(tag: string, w: number, scroll = w, cls = ''): HTMLElement {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    e.getBoundingClientRect = () => ({ width: w }) as DOMRect
    Object.defineProperty(e, 'scrollWidth', { value: scroll })
    Object.defineProperty(e, 'clientWidth', { value: w })
    return e
  }
  const ref = <T,>(current: T) => ({ current })

  it('uses the natural width of a cut name, the nav list and both status texts', () => {
    const row = el('div', 900)
    row.style.paddingLeft = '22px'
    row.style.paddingRight = '10px'
    row.style.columnGap = '20px'
    document.body.append(row)
    const chip = el('button', 30 + 150, 180)
    const burger = el('button', 44)
    burger.style.marginRight = '-8px'
    document.body.append(burger)
    const s = measureHeader({
      row: ref(row),
      brand: ref(el('a', 56 + 80)), // logo 44 + gap 12, name cut to 80 px
      wordmark: ref(el('span', 80, 400)), // the long name is 400 px
      navList: ref(el('ul', 600, 640)),
      chip: ref(chip),
      chipFull: ref(el('span', 150)),
      chipShort: ref(el('span', 50)),
      tools: ref(el('div', 119.4)),
      burger: ref(burger),
    })
    expect(s.available).toBe(900 - 32)
    expect(s.gap).toBe(20)
    expect(s.brand).toBe(56 + 400)
    expect(s.brandMin).toBe(56 + BRAND_MIN_TEXT + 1)
    expect(s.nav).toBe(641)
    expect(s.chipFull).toBe(30 + 150 + 1)
    expect(s.chipShort).toBe(30 + 50 + 1)
    expect(s.tools).toBe(121)
    expect(s.burger).toBe(36)
    row.remove()
    burger.remove()
  })

  it('reads the short status as in the flow when the chip shows it', () => {
    const chip = el('button', 30 + 50, 80, 'open-chip open-chip--short')
    const s = measureHeader({
      row: ref(null),
      brand: ref(null),
      wordmark: ref(null),
      navList: ref(null),
      chip: ref(chip),
      chipFull: ref(el('span', 150)),
      chipShort: ref(el('span', 50)),
      tools: ref(null),
      burger: ref(null),
    })
    expect(s.chipFull).toBe(181)
    expect(s.chipShort).toBe(81)
    expect(s.available).toBe(0)
  })

  it('measures against the widest pill the header has room for, not the current pill', () => {
    const header = el('header', 1920)
    header.style.paddingLeft = '24px'
    header.style.paddingRight = '24px'
    const row = el('div', 1180)
    row.style.paddingLeft = '22px'
    row.style.paddingRight = '10px'
    document.body.append(header, row)
    const none = { current: null }
    const s = measureHeader({
      header: ref(header), row: ref(row), brand: none, wordmark: none, navList: none,
      chip: none, chipFull: none, chipShort: none, tools: none, burger: none,
    })
    expect(s.outer).toBe(1872)
    expect(s.available).toBe(PILL_MAX - 32)
    // a site's own CSS keeps the row narrower than the pill it was given: trust the row
    header.style.setProperty('--header-pill', '1400px')
    expect(measureHeader({
      header: ref(header), row: ref(row), brand: none, wordmark: none, navList: none,
      chip: none, chipFull: none, chipShort: none, tools: none, burger: none,
    }).available).toBe(1180 - 32)
    header.remove()
    row.remove()
  })
})
