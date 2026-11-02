import { useSyncExternalStore } from 'react'
import { SOUND_KEY } from './storageRegistry'

/**
 * Klickljudet, samma som booqy.se, admin och Booqy Console: ett modernt, tyst
 * ett krispigt musklick som på en gamingmus (Web Audio, uträknat i förväg, inga filer) när gästen
 * trycker på en länk eller knapp, eller på Enter eller mellanslag. Aldrig vid
 * hovring. Ljudet är på från början och startar vid första trycket
 * (webbläsarnas regler för ljud); knappen Klickljud i sidfoten stänger av det
 * ("booqy-sound" i localStorage).
 */

const TARGETS =
  "a[href], button, summary, [role='tab'], [role='button'], label[for], select, input[type='checkbox'], input[type='radio']"
const CTA = "button[type='submit'], .btn-primary, .btn.primary"

// Ett krispigt, tätt musklick som på en gamingmus: tryck och ett snabbt släpp.
// Ljusast för länkar, lite djupare för knappar och huvudknapparna. [ton Hz, topp]
const VOICES: Record<'tick' | 'press' | 'cta', [number, number]> = {
  tick: [4536, 0.425],
  press: [4200, 0.5],
  cta: [3864, 0.56],
}

function storedSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

let on = storedSound()
let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

export function soundOn(): boolean {
  return on
}

export function setSound(next: boolean) {
  on = next
  try {
    localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
  } catch {
    /* privat läge utan lagring: valet gäller tills sidan laddas om */
  }
  for (const listener of listeners) listener()
  if (next) play('press') // ett bekräftande klick när ljudet slås på
}

export function useSound(): [boolean, () => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    soundOn,
    () => true,
  )
  return [value, () => setSound(!value)]
}

let unlocked = false

// Safari kan lämna ljudmotorn tyst: efter viloläge, byte av ljudutgång (AirPods,
// samtal, en annan app) eller en stund i bakgrunden, ofta medan den säger att allt
// går ("running"). Därför får ett tryck efter 30 sekunders tystnad en ny motor, som
// hör till den utgång som gäller nu; likaså efter att man kommit tillbaka till
// fliken, när Safari säger att ljudet avbröts, eller när den inte vaknat en sekund
// efter att den väcktes.
let stale = false
let wokeAt = 0
let usedAt = 0
const IDLE_MS = 30_000

/** Behöver nästa tryck en ny ljudmotor (se ovan)? */
function needsNew(c: AudioContext): boolean {
  return stale || Date.now() - usedAt > IDLE_MS || c.state === 'closed' || (c.state !== 'running' && wokeAt > 0 && performance.now() - wokeAt > 1000)
}

/**
 * Ett tryck när ljudmotorn inte är redo. Safari väcker bara ljud i ett klick,
 * ett släpp eller en tangent, inte när man trycker ned, så klicket spelas när
 * fingret eller musknappen släpps (unlock) i stället för att tystna.
 */
let pending: { kind: keyof typeof VOICES; at: number } | null = null

/** Spelar ett väntande klick när motorn är igång; ett som väntat över en sekund släpps. */
function flush() {
  const c = ctx
  if (!pending || !c || c.state !== 'running') return
  const { kind, at } = pending
  pending = null
  if (performance.now() - at < 1000) sound(c, kind)
}

function audio(): AudioContext | null {
  if (ctx && needsNew(ctx)) {
    ctx.close().catch(() => {})
    ctx = null
    unlocked = false
  }
  stale = false
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    const c = new AC()
    c.onstatechange = () => {
      if (c.state === 'running') wokeAt = 0
      else if ((c.state as string) === 'interrupted') stale = true
    }
    ctx = c
    wokeAt = 0
    usedAt = Date.now()
  }
  return ctx
}

function wake(c: AudioContext): Promise<void> {
  if (!wokeAt) wokeAt = performance.now()
  return c.resume()
}

/**
 * Klicket som färdiga ljudprover: ett tätt musklick (tryck och
 * släpp). Räknas ut en gång per röst i vanlig
 * JavaScript och spelas sedan bara upp. Inga filter eller oscillatorer när man
 * klickar, så det låter likadant och fungerar även i Safari.
 */
function clickSamples(sr: number, pitch: number, peak: number): Float32Array {
  const n = Math.ceil(sr * 0.08)
  const out = new Float32Array(n)
  // en ringande resonator (bandpass) ger det höga, krispiga plastljudet
  const w = (2 * Math.PI * pitch) / sr
  const rr = Math.exp(-w / 24)
  let seed = 7
  let y1 = 0
  let y2 = 0
  let max = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    seed = (seed * 16807) % 2147483647
    const noise = seed / 1073741823.5 - 1
    // trycket och, 55 ms senare, släppet med halv styrka
    const hit = noise * (Math.exp(-t / 0.0004) + (t >= 0.055 ? 0.5 * Math.exp(-(t - 0.055) / 0.0004) : 0))
    const y = hit * (1 - rr) + 2 * rr * Math.cos(w) * y1 - rr * rr * y2
    y2 = y1
    y1 = y
    const body = 0.25 * Math.sin(2 * Math.PI * pitch * 0.31 * t) * Math.exp(-t / 0.002)
    out[i] = Math.min(1, t / 0.0004) * (1.7 * y + body)
    max = Math.max(max, Math.abs(out[i]))
  }
  for (let i = 0; i < n; i++) out[i] *= peak / max
  return out
}

const buffers = new Map<string, AudioBuffer>()

/** Rösten som ljudbuffert, byggd en gång per ljudmotor och samplingsfrekvens. */
function clickBuffer(c: AudioContext, kind: keyof typeof VOICES): AudioBuffer {
  const key = `${kind}@${c.sampleRate}`
  let buf = buffers.get(key)
  if (!buf) {
    const [pitch, peak] = VOICES[kind]
    const samples = clickSamples(c.sampleRate, pitch, peak)
    buf = c.createBuffer(1, samples.length, c.sampleRate)
    buf.getChannelData(0).set(samples)
    buffers.set(key, buf)
  }
  return buf
}

function play(kind: keyof typeof VOICES) {
  if (!on) return
  try {
    const c = ctx
    if (c && !needsNew(c) && c.state === 'running') {
      sound(c, kind)
      return
    }
    // Inte redo: klicket väntar på släppet (unlock), eller på att motorn vaknar
    // om det här redan är ett klick eller en tangent
    pending = { kind, at: performance.now() }
    const ready = c ? (needsNew(c) ? null : c) : audio()
    if (ready) wake(ready).then(flush, () => {})
  } catch {
    /* inget ljud */
  }
}

function sound(c: AudioContext, kind: keyof typeof VOICES) {
  try {
    const src = c.createBufferSource()
    src.buffer = clickBuffer(c, kind)
    const gain = c.createGain()
    // samma nivå som standardvolymen (40 %) i admin och Booqy Console
    gain.gain.value = 0.4 * (5 / 7)
    src.connect(gain)
    gain.connect(c.destination)
    src.start(0)
    usedAt = Date.now()
  } catch {
    /* inget ljud */
  }
}

function kindOf(el: Element): keyof typeof VOICES {
  if (el.matches(CTA)) return 'cta'
  if (el.matches("button, summary, [role='tab'], [role='button'], select, input, label")) return 'press'
  return 'tick'
}

// signalen: en prick och två ringar där man trycker, var som helst på sidan
// (av med "minska rörelse")
function signal(x: number, y: number) {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const ring = document.createElement('span')
  ring.className = 'press-ripple'
  ring.style.left = `${x}px`
  ring.style.top = `${y}px`
  document.body.appendChild(ring)
  window.setTimeout(() => ring.remove(), 900)
}

let installed = false

/** Lyssnar en gång på dokumentet; varje tryck på sidan får klicket. */
export function installSound() {
  if (installed || typeof document === 'undefined') return
  installed = true
  // Safari låter bara ljud starta i ett klick eller en tangent, så det första
  // trycket väcker också ljudet för trycken som följer
  const unlock = () => {
    if (!on) return
    try {
      const c = audio()
      if (c && c.state !== 'running') wake(c).then(flush, () => {})
      if (c && !unlocked) {
        // Safari öppnar bara ljud i en riktig gest: ett tyst prov i den första håller det öppet
        const silent = c.createBufferSource()
        silent.buffer = c.createBuffer(1, 1, c.sampleRate)
        silent.connect(c.destination)
        silent.start(0)
        unlocked = true
      }
      flush()
    } catch {
      /* inget ljud */
    }
  }
  for (const type of ['pointerup', 'click', 'touchend', 'keydown']) document.addEventListener(type, unlock, { capture: true, passive: true })
  // tillbaka till fliken: nästa tryck får en ny ljudmotor
  document.addEventListener('visibilitychange', () => {
    if (ctx && document.visibilityState === 'visible') stale = true
  })
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
      signal(e.clientX, e.clientY)
      const el = (e.target as Element | null)?.closest?.(TARGETS)
      if (!el || (el as HTMLButtonElement).disabled) return
      play(kindOf(el))
    },
    { passive: true },
  )
  document.addEventListener('keydown', (e) => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return
    const el = document.activeElement
    if (!el || !el.matches(TARGETS)) return
    if (e.key === ' ' && el.matches('a[href]')) return
    play(kindOf(el))
  })
}
