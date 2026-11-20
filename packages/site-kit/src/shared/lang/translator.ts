import { LANG_CACHE_PREFIX } from '../storageRegistry'
import type { Lang } from './languages'
import { MAX_TEXT_CHARS, chunkTexts } from './translateApi'

/**
 * Översätter hela sidan på plats: varje textnod och attributen placeholder,
 * aria-label, aria-description, alt och title (och value på knapp-inputs),
 * i <body>, i <title> och i sidans beskrivning (<meta name="description">,
 * og:title, og:description). Kitets flöden, sajtens egna texter, portaler
 * (rullistor, modaler) och restaurangens data (meny, om oss) får samma väg.
 *
 * Regler (spec: application docs, site languages 3.3):
 * - Ändrar bara värdet i samma nod (nodeValue / setAttribute). Flyttar,
 *   delar eller lindar aldrig noder, så Reacts referenser håller.
 * - Minns per nod den svenska källan och det den själv skrev. Skriver React
 *   ny svenska blir den nya källan; den egna skrivningen ignoreras.
 *   Tillbaka till svenska: källan skrivs tillbaka, inget nätverk.
 * - Hoppar över translate="no", data-lang-own, script/style, kod,
 *   contenteditable, Stripes och säkerhetskontrollens iframes, och strängar
 *   som bara är pris, tid, tal, datum, telefon, e-post eller adress, eller
 *   ett skyddat namn. textarea och iframe: bara attributen (placeholder,
 *   title), aldrig innehållet.
 * - Klockslag i en mening ("Bordet hålls i 14:59") skickas som mall med fasta
 *   tider i stället, så att en nedräkning är en enda översättning; "kl"
 *   framför en tid tas bort på andra språk (blev annars "KL").
 * - Träffar i cachen skrivs direkt i observerns callback (före nästa
 *   ritning, så de aldrig blinkar); resten samlas i 30 ms och skickas i
 *   anrop om högst 100 strängar, högst två samtidigt.
 * - Fel (nätverk, 403, 429): svenskan står kvar, ett nytt försök efter 5 s,
 *   aldrig något felmeddelande för en saknad översättning.
 */

export type Target = Exclude<Lang, 'sv'>
export type TranslateFn = (lang: Target, texts: string[]) => Promise<{ texts: string[]; partial?: boolean }>

export interface TranslatorOptions {
  translate: TranslateFn
  /** Skyddade namn: en sträng som är exakt ett av dem skickas inte. */
  keep?: () => readonly string[]
  /** Anrop pågår eller väntar (väljarens laddring). */
  onBusy?: (busy: boolean) => void
  /** Någon text på sidan kunde inte översättas (efter omförsöket). */
  onIncomplete?: (incomplete: boolean) => void
  debounceMs?: number
  retryMs?: number
  maxInFlight?: number
}

/** Delträd som aldrig översätts. */
export const SKIP_SELECTOR = [
  '[translate="no"]',
  '[data-lang-own]',
  'script',
  'style',
  'noscript',
  'template',
  'code',
  'pre',
  'kbd',
  'samp',
  'var',
  '[contenteditable]:not([contenteditable="false"])',
  // Kortformuläret och säkerhetskontrollen har egna texter (Stripe översätter själv).
  'iframe[name^="__privateStripe"]',
  'iframe[src*="stripe.com"]',
  'iframe[src*="awswaf"]',
].join(',')

/** Element vars attribut översätts men aldrig innehållet (gästens text, en annan sida). */
export const ATTRS_ONLY_SELECTOR = 'textarea,iframe'

/** Sidans beskrivning i <head> (attributet content). */
export const HEAD_META_SELECTOR = [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
].join(',')

export const TRANSLATED_ATTRS = ['placeholder', 'aria-label', 'aria-description', 'alt', 'title', 'value', 'content'] as const
type Attr = (typeof TRANSLATED_ATTRS)[number]

const LETTER = /\p{L}/u
// Bara siffror, tider, datum och belopp ("245 kr", "18:00\u201322:00", "1 245,50 SEK", "245:-").
const AMOUNT = /^[\s\d.,:;/+\-\u2013\u2212()%#]*(kr|sek|:-|st|min|h)?[\s.]*$/iu
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const URL_LIKE = /^(https?:\/\/|www\.)\S+$/iu

/** Ska strängen översättas alls? (Strängen är redan trimmad.) */
export function worthTranslating(core: string, keep: readonly string[] = []): boolean {
  if (!core || !LETTER.test(core)) return false
  if (AMOUNT.test(core) || EMAIL.test(core) || URL_LIKE.test(core)) return false
  return !keep.includes(core)
}

// "kl 18:00", "kl. 19:00", "till kl" i slutet av en textnod (tiden står i nästa nod).
const KL = /(^|[\s(])kl\.?(?:\s+(?=\d)|\s*$)/giu
// Klockslag och nedräkningar: 18:00, 18.30, 14:59 (inte 1.245 eller 2026-11-20).
const CLOCK = /(?<![\d.,:])\d{1,2}[:.]\d{2}(?!\d|[.,:]\d)/gu
const MAX_SLOTS = 9

export interface Prepared {
  /** Det som översätts och cachas (tider utbytta mot fasta platshållare). */
  text: string
  /** Platshållare -> den riktiga tiden. */
  slots: [string, string][]
}

/**
 * Gör om en svensk sträng innan den översätts: "kl" framför en tid tas bort
 * (tiden räcker på alla språk) och varje klockslag byts mot en fast tid
 * (10:10, 11:11 ...), så att "Bordet hålls i 14:59" och "... 14:58" är samma
 * översättning. Servern skyddar siffrorna, så platshållarna kommer tillbaka
 * orörda och byts tillbaka i `fill`.
 */
export function prepare(core: string): Prepared {
  let text = core.replace(KL, '$1').replace(/\s{2,}/gu, ' ').trim()
  const slots: [string, string][] = []
  text = text.replace(CLOCK, (m) => {
    if (slots.length >= MAX_SLOTS) return m
    const v = 10 + slots.length
    const slot = `${v}:${v}`
    slots.push([slot, m])
    return slot
  })
  return { text, slots }
}

/** Sätter tillbaka de riktiga tiderna i översättningen. */
export function fill(translated: string, slots: readonly [string, string][]): string {
  let out = translated
  for (const [slot, real] of slots) out = out.split(slot).join(real)
  return out
}

/** Text över 3 000 tecken delas vid meningsslut (och hårt om en mening är för lång). */
export function splitLong(text: string, max = MAX_TEXT_CHARS): string[] {
  if (text.length <= max) return [text]
  const parts: string[] = []
  let current = ''
  for (const sentence of text.split(/(?<=[.!?])\s+/u)) {
    let s = sentence
    while (s.length > max) {
      if (current) {
        parts.push(current)
        current = ''
      }
      parts.push(s.slice(0, max))
      s = s.slice(max)
    }
    if (!s) continue
    if (current && current.length + 1 + s.length > max) {
      parts.push(current)
      current = s
    } else {
      current = current ? `${current} ${s}` : s
    }
  }
  if (current) parts.push(current)
  return parts
}

interface Rec {
  /** Svenska källan (det React eller sajten skrev senast). */
  src: string
  /** Det översättaren skrev (null: inget, källan står). */
  wrote: string | null
  /** Språket källan senast behandlades för. */
  lang: Lang
}

interface Job {
  node: Text | Element
  attr: Attr | null
  src: string
  lead: string
  trail: string
  /** Det som översätts (efter `prepare`); tomt när inget behöver översättas. */
  parts: string[]
  /** Resultatet när `parts` är tomt (t.ex. "kl 18:00" blir "18:00"). */
  bare: string
  slots: [string, string][]
  lang: Lang
}

const CACHE_LIMIT = 1_500_000

function readCache(lang: Lang): Map<string, string> {
  try {
    const raw = sessionStorage.getItem(`${LANG_CACHE_PREFIX}${lang}`)
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    if (!obj || typeof obj !== 'object') return new Map()
    return new Map(Object.entries(obj).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch {
    return new Map()
  }
}

function writeCache(lang: Lang, cache: Map<string, string>): void {
  let entries = [...cache.entries()]
  for (let attempt = 0; attempt < 4 && entries.length; attempt++) {
    const json = JSON.stringify(Object.fromEntries(entries))
    if (json.length <= CACHE_LIMIT) {
      try {
        sessionStorage.setItem(`${LANG_CACHE_PREFIX}${lang}`, json)
        return
      } catch {
        // Fullt eller blockerat: släpp den äldsta halvan och försök igen.
      }
    }
    entries = entries.slice(Math.floor(entries.length / 2))
  }
}

export class Translator {
  private lang: Lang = 'sv'
  private readonly opts: Required<Omit<TranslatorOptions, 'keep' | 'onBusy' | 'onIncomplete'>> &
    Pick<TranslatorOptions, 'keep' | 'onBusy' | 'onIncomplete'>
  private observer: MutationObserver | null = null
  private readonly textRecs = new WeakMap<Text, Rec>()
  private readonly attrRecs = new WeakMap<Element, Map<Attr, Rec>>()
  private readonly caches = new Map<Lang, Map<string, string>>()
  private failed = new Set<string>()
  private retried = new Set<string>()
  private waiting = new Set<Job>()
  private queue = new Set<string>()
  private retryQueue = new Set<string>()
  private chunks: string[][] = []
  private inFlight = 0
  private inFlightParts = new Set<string>()
  private generation = 0
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private busy = false
  private incomplete = false
  private idleWaiters: (() => void)[] = []

  constructor(options: TranslatorOptions) {
    this.opts = { debounceMs: 30, retryMs: 5_000, maxInFlight: 2, ...options }
  }

  get language(): Lang {
    return this.lang
  }

  /** Börjar följa sidan. */
  start(lang: Lang): void {
    if (this.observer || typeof MutationObserver === 'undefined') return
    this.observer = new MutationObserver((records) => this.handle(records))
    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRS],
    })
    this.lang = lang
    if (lang !== 'sv') this.walkAll()
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
    for (const t of [this.flushTimer, this.retryTimer, this.saveTimer]) if (t) clearTimeout(t)
    this.flushTimer = this.retryTimer = this.saveTimer = null
    this.reset()
  }

  /** Byter språk: allt tillbaka till svenska, sedan det nya språket. */
  setLang(lang: Lang): void {
    if (lang === this.lang) return
    if (this.observer) this.handle(this.observer.takeRecords())
    this.reset()
    this.restore()
    this.lang = lang
    if (lang !== 'sv' && this.observer) this.walkAll()
    this.updateBusy()
  }

  /**
   * Översätter texter innan de sätts in i sidan (meny, catering): när noderna
   * sedan kommer är det cacheträffar som skrivs före nästa ritning. Löser när
   * inga anrop pågår.
   */
  prefetch(texts: readonly string[]): Promise<void> {
    if (this.lang === 'sv') return Promise.resolve()
    const cache = this.cache()
    const keep = this.opts.keep?.() ?? []
    for (const t of texts) {
      const core = t.trim()
      if (!worthTranslating(core, keep)) continue
      const { text } = prepare(core)
      if (!worthTranslating(text, keep)) continue
      for (const p of splitLong(text)) {
        if (!cache.has(p) && !this.failed.has(p) && !this.inFlightParts.has(p)) this.queue.add(p)
      }
    }
    this.scheduleFlush()
    this.updateBusy()
    return this.whenIdle()
  }

  /** Anrop pågår eller väntar just nu. */
  busyNow(): boolean {
    return this.isBusy()
  }

  /** Löser när inga anrop pågår eller väntar. */
  whenIdle(): Promise<void> {
    if (!this.isBusy()) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private reset(): void {
    this.generation++
    this.waiting.clear()
    this.queue.clear()
    this.retryQueue.clear()
    this.chunks = []
    this.inFlight = 0
    this.inFlightParts.clear()
    this.failed = new Set()
    this.retried = new Set()
    this.setIncomplete(false)
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.flushTimer = this.retryTimer = null
  }

  private cache(): Map<string, string> {
    let c = this.caches.get(this.lang)
    if (!c) {
      c = this.lang === 'sv' ? new Map() : readCache(this.lang)
      this.caches.set(this.lang, c)
    }
    return c
  }

  // --- DOM ------------------------------------------------------------------

  private handle(records: MutationRecord[]): void {
    for (const r of records) {
      if (r.type === 'characterData') {
        if (r.target.nodeType === Node.TEXT_NODE) this.visitText(r.target as Text)
      } else if (r.type === 'attributes') {
        const el = r.target as Element
        const attr = r.attributeName as Attr
        if (this.attrAllowed(el, attr) && !this.skipped(el)) this.process(el, attr)
      } else {
        r.addedNodes.forEach((n) => this.visit(n))
      }
    }
    this.updateBusy()
  }

  private skipped(el: Element): boolean {
    if (el.closest(SKIP_SELECTOR)) return true
    // I <head> bara <title> och sidans beskrivning.
    return !!el.closest('head') && el.tagName !== 'TITLE' && !el.matches(HEAD_META_SELECTOR)
  }

  private attrAllowed(el: Element, attr: string | null): attr is Attr {
    if (!attr || !(TRANSLATED_ATTRS as readonly string[]).includes(attr)) return false
    if (attr === 'value') return el instanceof HTMLInputElement && /^(button|submit|reset)$/.test(el.type)
    if (attr === 'content') return el.matches(HEAD_META_SELECTOR)
    return true
  }

  private visit(n: Node): void {
    if (n.nodeType === Node.TEXT_NODE) this.visitText(n as Text)
    else if (n.nodeType === Node.ELEMENT_NODE && !this.skipped(n as Element)) this.walk(n as Element)
  }

  private visitText(t: Text): void {
    const parent = t.parentElement
    if (!parent || this.skipped(parent) || parent.closest(ATTRS_ONLY_SELECTOR)) return
    this.process(t, null)
  }

  private walk(root: Element): void {
    this.processAttrs(root)
    if (root.matches(ATTRS_ONLY_SELECTOR)) return
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT
        const el = n as Element
        if (el.matches(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT
        if (el.matches(ATTRS_ONLY_SELECTOR)) {
          // Platshållaren och titeln översätts, gästens text och iframens sida aldrig.
          this.processAttrs(el)
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    })
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) this.process(n as Text, null)
      else this.processAttrs(n as Element)
    }
  }

  private walkAll(): void {
    const title = document.querySelector('head > title')
    if (title) title.childNodes.forEach((n) => n.nodeType === Node.TEXT_NODE && this.process(n as Text, null))
    document.querySelectorAll(HEAD_META_SELECTOR).forEach((m) => this.process(m, 'content'))
    if (document.body) this.walk(document.body)
  }

  private processAttrs(el: Element): void {
    for (const attr of TRANSLATED_ATTRS) {
      if (el.hasAttribute(attr) && this.attrAllowed(el, attr)) this.process(el, attr)
    }
  }

  private read(node: Text | Element, attr: Attr | null): string | null {
    return attr ? (node as Element).getAttribute(attr) : (node as Text).nodeValue
  }

  private write(node: Text | Element, attr: Attr | null, value: string): void {
    if (attr) (node as Element).setAttribute(attr, value)
    else (node as Text).nodeValue = value
  }

  private rec(node: Text | Element, attr: Attr | null): Rec | undefined {
    return attr ? this.attrRecs.get(node as Element)?.get(attr) : this.textRecs.get(node as Text)
  }

  private setRec(node: Text | Element, attr: Attr | null, rec: Rec): void {
    if (!attr) {
      this.textRecs.set(node as Text, rec)
      return
    }
    let m = this.attrRecs.get(node as Element)
    if (!m) {
      m = new Map()
      this.attrRecs.set(node as Element, m)
    }
    m.set(attr, rec)
  }

  private process(node: Text | Element, attr: Attr | null): void {
    const value = this.read(node, attr)
    if (value == null) return
    const old = this.rec(node, attr)
    if (old) {
      if (old.wrote !== null && value === old.wrote) return // vår egen skrivning
      if (old.wrote === null && value === old.src && old.lang === this.lang) return // redan behandlad
    }
    this.setRec(node, attr, { src: value, wrote: null, lang: this.lang })
    if (this.lang === 'sv') return
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/u.exec(value) ?? ['', '', value, '']
    const keep = this.opts.keep?.() ?? []
    if (!worthTranslating(core, keep)) return
    const prep = prepare(core)
    const parts = worthTranslating(prep.text, keep) ? splitLong(prep.text) : []
    const job: Job = { node, attr, src: value, lead, trail, parts, bare: prep.text, slots: prep.slots, lang: this.lang }
    if (this.apply(job)) return
    this.waiting.add(job)
    const cache = this.cache()
    for (const p of job.parts) if (!cache.has(p) && !this.failed.has(p)) this.queue.add(p)
    this.scheduleFlush()
  }

  /** Skriver översättningen om alla delar finns. true = jobbet är klart (skrivet eller inaktuellt). */
  private apply(job: Job): boolean {
    if (job.lang !== this.lang) return true
    const cache = this.cache()
    const out: string[] = []
    for (const p of job.parts) {
      const t = cache.get(p)
      if (t !== undefined) out.push(t)
      else if (this.failed.has(p)) out.push(p)
      else return false
    }
    const rec = this.rec(job.node, job.attr)
    if (!rec || rec.src !== job.src || rec.lang !== job.lang || rec.wrote !== null) return true
    if (this.read(job.node, job.attr) !== job.src) return true
    const core = fill(job.parts.length ? out.join(' ') : job.bare, job.slots)
    // "kl" ensam i en nod blir ingenting: ett mellanslag mellan datum och tid räcker.
    const text = core ? job.lead + core + job.trail : job.lead || job.trail ? ' ' : ''
    if (text === job.src) return true
    rec.wrote = text
    this.write(job.node, job.attr, text)
    return true
  }

  /** Allt översättaren skrivit tillbaka till källan (även i delträd som hoppas över nu). */
  private restore(): void {
    const restoreNode = (node: Text | Element, attr: Attr | null) => {
      const rec = this.rec(node, attr)
      if (!rec) return
      if (rec.wrote !== null && this.read(node, attr) === rec.wrote) this.write(node, attr, rec.src)
      rec.wrote = null
      rec.lang = 'sv'
    }
    const root = document.documentElement
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    for (let n: Node | null = root; n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) restoreNode(n as Text, null)
      else for (const attr of TRANSLATED_ATTRS) restoreNode(n as Element, attr)
    }
    // Våra egna skrivningar ska inte ses som ny svenska.
    if (this.observer) this.observer.takeRecords()
  }

  // --- Nätverk --------------------------------------------------------------

  private scheduleFlush(): void {
    if (this.flushTimer || !this.queue.size) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, this.opts.debounceMs)
  }

  private flush(): void {
    if (this.lang === 'sv') return
    const cache = this.cache()
    const todo = [...this.queue].filter((p) => !cache.has(p) && !this.inFlightParts.has(p) && !this.failed.has(p))
    this.queue.clear()
    this.chunks.push(...chunkTexts(todo))
    this.pump()
    this.updateBusy()
  }

  private pump(): void {
    while (this.inFlight < this.opts.maxInFlight && this.chunks.length) this.send(this.chunks.shift()!)
  }

  private send(chunk: string[]): void {
    const lang = this.lang as Target
    const gen = this.generation
    this.inFlight++
    for (const p of chunk) this.inFlightParts.add(p)
    const cache = this.cache()
    this.opts
      .translate(lang, chunk)
      .then(
        (res) => {
          if (gen !== this.generation) return
          res.texts.forEach((t, i) => {
            const src = chunk[i]
            if (typeof t !== 'string' || (res.partial && t === src)) this.retryLater(src)
            else cache.set(src, t)
          })
          this.saveSoon(lang, cache)
        },
        () => {
          if (gen === this.generation) for (const p of chunk) this.retryLater(p)
        },
      )
      .finally(() => {
        if (gen !== this.generation) return
        this.inFlight--
        for (const p of chunk) this.inFlightParts.delete(p)
        this.applyWaiting()
        this.pump()
        this.updateBusy()
      })
  }

  private retryLater(part: string): void {
    if (this.retried.has(part)) {
      this.failed.add(part)
      this.setIncomplete(true)
      return
    }
    this.retried.add(part)
    this.retryQueue.add(part)
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      for (const p of this.retryQueue) this.queue.add(p)
      this.retryQueue.clear()
      this.flush()
    }, this.opts.retryMs)
  }

  private applyWaiting(): void {
    // Jobb som väntar på ett omförsök står kvar på svenska så länge.
    for (const job of this.waiting) if (this.apply(job)) this.waiting.delete(job)
  }

  private saveSoon(lang: Lang, cache: Map<string, string>): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      writeCache(lang, cache)
    }, 300)
  }

  private isBusy(): boolean {
    return this.inFlight > 0 || this.chunks.length > 0 || this.queue.size > 0
  }

  private setIncomplete(incomplete: boolean): void {
    if (incomplete === this.incomplete) return
    this.incomplete = incomplete
    this.opts.onIncomplete?.(incomplete)
  }

  private updateBusy(): void {
    const busy = this.isBusy()
    if (busy !== this.busy) {
      this.busy = busy
      this.opts.onBusy?.(busy)
    }
    if (!busy && this.idleWaiters.length) {
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const w of waiters) w()
    }
  }
}
