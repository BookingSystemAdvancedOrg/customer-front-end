import { useSyncExternalStore } from 'react'
import { SOUND_KEY } from './storageRegistry'

/**
 * Klickljudet, samma som booqy.se, admin och Booqy Console: ett djupt, mjukt
 * klocktick (Web Audio, skapat i stunden, inga filer) när gästen
 * trycker på en länk eller knapp, eller på Enter eller mellanslag. Aldrig vid
 * hovring. Ljudet är på från början och startar vid första trycket
 * (webbläsarnas regler för ljud); knappen Klickljud i sidfoten stänger av det
 * ("booqy-sound" i localStorage).
 */

const TARGETS =
  "a[href], button, summary, [role='tab'], [role='button'], label[for], select, input[type='checkbox'], input[type='radio']"
const CTA = "button[type='submit'], .btn-primary, .btn.primary"

// Ett djupt, mjukt tick som från en klocka av trä: ett kort anslag och en
// rund ton som klingar ut. Ljusast för länkar, djupare för knappar och
// djupast för huvudknapparna. [ton Hz, volym]
const VOICES: Record<'tick' | 'press' | 'cta', [number, number]> = {
  tick: [1700, 0.34],
  press: [1450, 0.42],
  cta: [1250, 0.48],
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

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

function play(kind: keyof typeof VOICES) {
  if (!on) return
  try {
    const c = audio()
    if (!c) return
    // Safari startar ljudet sovande: väck det och spela när det är igång
    if (c.state !== 'running') {
      c.resume().then(() => {
        if (c.state === 'running') play(kind)
      }, () => {})
      return
    }
    const [pitch, vol] = VOICES[kind]
    const t = c.currentTime + 0.003
    const sr = c.sampleRate
    // en begränsare håller topparna nere, så ljudet aldrig sprakar
    const limit = c.createDynamicsCompressor()
    limit.threshold.value = -6
    limit.knee.value = 0
    limit.ratio.value = 20
    limit.attack.value = 0.001
    limit.release.value = 0.05
    limit.connect(c.destination)
    const out = c.createBiquadFilter()
    out.type = 'lowpass'
    out.frequency.value = 4000
    out.connect(limit)
    // anslaget: 3 ms mjukt brus, som när träet träffas
    const buf = c.createBuffer(1, Math.ceil(sr * 0.003), sr)
    const d = buf.getChannelData(0)
    let seed = 7
    for (let i = 0; i < d.length; i++) d[i] = ((seed = (seed * 16807) % 2147483647) / 1073741823.5 - 1) * Math.min(1, i / (sr * 0.0004)) * Math.pow(1 - i / d.length, 2)
    const src = c.createBufferSource()
    src.buffer = buf
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = pitch * 2
    band.Q.value = 1.5
    const g = c.createGain()
    g.gain.value = vol * 4.5
    src.connect(band).connect(g).connect(out)
    src.start(t)
    // kroppen: en rund ton som klingar ut, och en svag överton som ger träkänslan
    const tone = (hz: number, gain: number, decay: number) => {
      const osc = c.createOscillator()
      osc.frequency.setValueAtTime(hz * 1.04, t)
      osc.frequency.exponentialRampToValueAtTime(hz, t + 0.01)
      const og = c.createGain()
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(gain, t + 0.0015)
      og.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      osc.connect(og).connect(out)
      osc.start(t)
      osc.stop(t + decay + 0.005)
    }
    tone(pitch, vol * 1.8, 0.05)
    tone(pitch * 2.76, vol * 0.45, 0.02)
  } catch {
    /* inget ljud */
  }
}

function kindOf(el: Element): keyof typeof VOICES {
  if (el.matches(CTA)) return 'cta'
  if (el.matches("button, summary, [role='tab'], [role='button'], select, input, label")) return 'press'
  return 'tick'
}

let installed = false
let unlocked = false

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
      if (c && c.state !== 'running') void c.resume()
      if (c && !unlocked) {
        // Safari öppnar bara ljud i en riktig gest: ett tyst prov i den första håller det öppet
        const silent = c.createBufferSource()
        silent.buffer = c.createBuffer(1, 1, c.sampleRate)
        silent.connect(c.destination)
        silent.start(0)
        unlocked = true
      }
    } catch {
      /* inget ljud */
    }
  }
  for (const type of ['pointerup', 'click', 'touchend', 'keydown']) document.addEventListener(type, unlock, { capture: true, passive: true })
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
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
