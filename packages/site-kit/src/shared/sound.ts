import { useSyncExternalStore } from 'react'
import { SOUND_KEY } from './storageRegistry'

/**
 * Klickljudet, samma som booqy.se, admin och Booqy Console: ett dämpat,
 * traditionellt klick (Web Audio, skapat i stunden, inga filer) när gästen
 * trycker på en länk eller knapp, eller på Enter eller mellanslag. Aldrig vid
 * hovring. Ljudet är på från början och startar vid första trycket
 * (webbläsarnas regler för ljud); knappen Klickljud i sidfoten stänger av det
 * ("booqy-sound" i localStorage).
 */

const TARGETS =
  "a[href], button, summary, [role='tab'], [role='button'], label[for], select, input[type='checkbox'], input[type='radio']"
const CTA = "button[type='submit'], .btn-primary, .btn.primary"

// Ett traditionellt klick, dämpat: ett kort, mjukt knäpp med en liten rund
// ton under, som en bra strömbrytare på håll. Ljusast för länkar, lite
// djupare för knappar och huvudknapparna. [ton Hz, volym]
const VOICES: Record<'tick' | 'press' | 'cta', [number, number]> = {
  tick: [3000, 0.13],
  press: [2600, 0.17],
  cta: [2200, 0.21],
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
    const t = c.currentTime + 0.002
    const sr = c.sampleRate
    const out = c.createBiquadFilter()
    out.type = 'lowpass'
    out.frequency.value = 4500
    out.connect(c.destination)
    // knäppet: 6 ms brus som tonas in på en halv millisekund, så det aldrig sprakar
    const buf = c.createBuffer(1, Math.ceil(sr * 0.006), sr)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (sr * 0.0005)) * Math.pow(1 - i / d.length, 4)
    const src = c.createBufferSource()
    src.buffer = buf
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = pitch
    band.Q.value = 1.4
    const g = c.createGain()
    g.gain.value = vol
    src.connect(band).connect(g).connect(out)
    src.start(t)
    // kroppen: en kort rund ton under knäppet, det som gör det till en knapp och inte brus
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(pitch * 0.42, t)
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.36, t + 0.015)
    const og = c.createGain()
    og.gain.setValueAtTime(0, t)
    og.gain.linearRampToValueAtTime(vol * 0.6, t + 0.001)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.018)
    osc.connect(og).connect(out)
    osc.start(t)
    osc.stop(t + 0.02)
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
    } catch {
      /* inget ljud */
    }
  }
  for (const type of ['click', 'touchend', 'keydown']) document.addEventListener(type, unlock, { capture: true, passive: true })
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
