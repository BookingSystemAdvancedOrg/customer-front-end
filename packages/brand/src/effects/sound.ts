/**
 * The click sound, the same in every Booqy app: a crisp gaming-mouse click
 * (press and a quick release), computed once per voice in plain JavaScript
 * into an AudioBuffer and then only played back through one gain node. No
 * live filters or oscillators when clicking: those graphs were silent in
 * Safari. Keep it a pre-rendered buffer.
 *
 * Sound is on by default and starts on the first press (autoplay rules);
 * the choice lives in localStorage ("booqy-sound", "booqy-sound-volume",
 * listed in every app's storage registry).
 */
export const SOUND_KEY = 'booqy-sound'
export const SOUND_VOLUME_KEY = 'booqy-sound-volume'

export type Voice = 'tick' | 'press' | 'cta'

// Brightest for links, a little deeper for buttons and the main actions. [pitch Hz, peak]
const VOICES: Record<Voice, [number, number]> = {
  tick: [4536, 0.425],
  press: [4200, 0.5],
  cta: [3864, 0.56],
}

/** Volume 0-100. 40 is the standard level, 0 is silent. */
export const DEFAULT_VOLUME = 40
/** The gain at 100 %: as loud as 50 % used to be (full strength was too loud). */
const MAX_GAIN = 5 / 7

function storedSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

function storedVolume(): number {
  try {
    const raw = localStorage.getItem(SOUND_VOLUME_KEY)
    const v = Number(raw)
    return raw !== null && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

let on = typeof window === 'undefined' ? true : storedSound()
let volume = typeof window === 'undefined' ? DEFAULT_VOLUME : storedVolume()
let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

export function soundOn(): boolean {
  return on
}

export function setSound(next: boolean): void {
  on = next
  try {
    localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
  } catch {
    /* private mode without storage */
  }
  listeners.forEach((l) => l())
  if (next) playClick('press') // a confirmation click when sound comes back on
}

export function soundVolume(): number {
  return volume
}

/** Saves the volume. A click plays when the slider is released (preview), not while dragging. */
export function setSoundVolume(next: number, preview = false): void {
  volume = Math.min(100, Math.max(0, Math.round(next)))
  try {
    localStorage.setItem(SOUND_VOLUME_KEY, String(volume))
  } catch {
    /* private mode without storage */
  }
  listeners.forEach((l) => l())
  if (preview) playClick('press')
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** One voice as samples: a ringing resonator (bandpass) gives the high, crisp plastic sound. */
export function clickSamples(sr: number, pitch: number, peak: number): Float32Array {
  const n = Math.ceil(sr * 0.08)
  const out = new Float32Array(n)
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
    // the press and, 55 ms later, the release at half strength
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

export function voiceSamples(sr: number, kind: Voice): Float32Array {
  const [pitch, peak] = VOICES[kind]
  return clickSamples(sr, pitch, peak)
}

let unlocked = false

// Safari can leave the audio engine silent: after sleep, a change of output
// (AirPods, a call, another app) or a while in the background, often while it
// says everything runs ("running"). So a press after 30 seconds of silence
// gets a new engine for the output that applies now; likewise after coming
// back to the tab, when Safari says audio was interrupted, or when it has not
// woken one second after it was woken.
let stale = false
let wokeAt = 0
let usedAt = 0
const IDLE_MS = 30_000

function needsNew(c: AudioContext): boolean {
  return stale || Date.now() - usedAt > IDLE_MS || c.state === 'closed' || (c.state !== 'running' && wokeAt > 0 && performance.now() - wokeAt > 1000)
}

// A press while the engine is not ready. Safari only wakes audio on a click,
// a release or a key, not on press-down, so the click plays when the finger
// or mouse button is released (unlock) instead of going silent.
let pending: { kind: Voice; at: number } | null = null

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

const buffers = new Map<string, AudioBuffer>()

/** The voice as an audio buffer, built once per engine sample rate. */
function clickBuffer(c: AudioContext, kind: Voice): AudioBuffer {
  const key = `${kind}@${c.sampleRate}`
  let buf = buffers.get(key)
  if (!buf) {
    const samples = voiceSamples(c.sampleRate, kind)
    buf = c.createBuffer(1, samples.length, c.sampleRate)
    buf.getChannelData(0).set(samples)
    buffers.set(key, buf)
  }
  return buf
}

/** Plays one click now, or when the engine wakes (see above). */
export function playClick(kind: Voice): void {
  if (!on || volume <= 0 || typeof window === 'undefined') return
  try {
    const c = ctx
    if (c && !needsNew(c) && c.state === 'running') {
      sound(c, kind)
      return
    }
    pending = { kind, at: performance.now() }
    const ready = c ? (needsNew(c) ? null : c) : audio()
    if (ready) wake(ready).then(flush, () => {})
  } catch {
    /* no sound */
  }
}

function sound(c: AudioContext, kind: Voice) {
  try {
    const src = c.createBufferSource()
    src.buffer = clickBuffer(c, kind)
    const gain = c.createGain()
    gain.gain.value = (volume / 100) * MAX_GAIN
    src.connect(gain)
    gain.connect(c.destination)
    src.start(0)
    usedAt = Date.now()
  } catch {
    /* no sound: the visible feedback is enough */
  }
}

let installed = false

/**
 * Wakes audio on the first click, release or key (Safari only lets audio
 * start inside one) and marks the engine stale when the tab comes back.
 * installPress calls this; call it yourself only for sound without press.
 */
export function installSoundUnlock(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  const unlock = () => {
    if (!on) return
    try {
      const c = audio()
      if (!c) return
      if (c.state !== 'running') wake(c).then(flush, () => {})
      if (!unlocked) {
        const silent = c.createBufferSource()
        silent.buffer = c.createBuffer(1, 1, c.sampleRate)
        silent.connect(c.destination)
        silent.start(0)
        unlocked = true
      }
      flush()
    } catch {
      /* no audio */
    }
  }
  for (const type of ['pointerup', 'click', 'touchend', 'keydown']) document.addEventListener(type, unlock, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (ctx && document.visibilityState === 'visible') stale = true
  })
}
