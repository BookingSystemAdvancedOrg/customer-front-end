import { useSyncExternalStore } from 'react'
import { SOUND_KEY } from './storageRegistry'

/**
 * Klickljudet, samma som booqy.se, admin och Booqy Console: ett traditionellt
 * mekaniskt klick (Web Audio, skapat i stunden, inga filer) när gästen
 * trycker på en länk eller knapp, eller på Enter eller mellanslag. Aldrig vid
 * hovring. Ljudet är på från början och startar vid första trycket
 * (webbläsarnas regler för ljud); knappen Klickljud i sidfoten stänger av det
 * ("booqy-sound" i localStorage).
 */

const TARGETS =
  "a[href], button, summary, [role='tab'], [role='button'], label[for], select, input[type='checkbox'], input[type='radio']"
const CTA = "button[type='submit'], .btn-primary, .btn.primary"

// Ett traditionellt mekaniskt klick: ett fast klick när knappen går ner och
// ett lättare tick när den fjädrar tillbaka. Ljusast för länkar, lite djupare
// och fylligare för knappar och huvudknapparna. [ton Hz, volym]
const VOICES: Record<'tick' | 'press' | 'cta', [number, number]> = {
  tick: [4200, 0.34],
  press: [3600, 0.42],
  cta: [3100, 0.48],
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
    // en begränsare håller topparna under 0 dB, så det hörs tydligt utan att spraka
    const limit = c.createDynamicsCompressor()
    limit.threshold.value = -6
    limit.knee.value = 0
    limit.ratio.value = 20
    limit.attack.value = 0.001
    limit.release.value = 0.05
    limit.connect(c.destination)
    const out = c.createBiquadFilter()
    out.type = 'lowpass'
    out.frequency.value = 7000
    out.connect(limit)
    // ett knäpp i strömbrytaren: 6 ms brus som klingar på en ton, med en liten
    // knack under. Bruset är detsamma varje gång (fast frö), som en riktig
    // brytare, så varje tryck låter likadant och volymen aldrig hoppar
    const snap = (at: number, hz: number, gain: number) => {
      const buf = c.createBuffer(1, Math.ceil(sr * 0.006), sr)
      const d = buf.getChannelData(0)
      let seed = 7
      for (let i = 0; i < d.length; i++) d[i] = ((seed = (seed * 16807) % 2147483647) / 1073741823.5 - 1) * Math.min(1, i / (sr * 0.0003)) * Math.pow(1 - i / d.length, 2)
      const src = c.createBufferSource()
      src.buffer = buf
      const ring = c.createBiquadFilter()
      ring.type = 'bandpass'
      ring.frequency.value = hz
      ring.Q.value = 3.5
      const g = c.createGain()
      g.gain.value = gain * 14
      src.connect(ring).connect(g).connect(out)
      src.start(at)
      const osc = c.createOscillator()
      osc.frequency.value = hz * 0.3
      const og = c.createGain()
      og.gain.setValueAtTime(0, at)
      og.gain.linearRampToValueAtTime(gain * 1.6, at + 0.001)
      og.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
      osc.connect(og).connect(out)
      osc.start(at)
      osc.stop(at + 0.032)
    }
    // nedtryck, och strax efter det lättare släppet
    snap(t, pitch, vol)
    snap(t + 0.03, pitch * 1.2, vol * 0.5)
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
