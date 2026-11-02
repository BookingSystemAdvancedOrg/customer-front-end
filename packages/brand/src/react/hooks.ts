import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { busySnapshot, subscribeBusy } from '../effects/busy'
import type { BusyState } from '../effects/busy'
import { currentTheme, setTheme, subscribeTheme, toggleTheme } from '../effects/theme'
import type { Theme } from '../effects/theme'
import { DEFAULT_VOLUME, setSound, soundOn, soundVolume, subscribeSound } from '../effects/sound'
import { pourLiquid } from '../effects/liquid'
import type { PourHandle, PourOptions } from '../effects/liquid'

export function useBusy(): BusyState {
  return useSyncExternalStore(subscribeBusy, busySnapshot, busySnapshot)
}

export function useTheme(): { theme: Theme; toggle: (origin?: { x: number; y: number }) => void; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'light' as Theme)
  const toggle = useCallback((origin?: { x: number; y: number }) => toggleTheme(origin), [])
  return { theme, toggle, setTheme }
}

export function useSound(): [boolean, () => void] {
  const value = useSyncExternalStore(subscribeSound, soundOn, () => true)
  return [value, () => setSound(!value)]
}

export function useSoundVolume(): number {
  return useSyncExternalStore(subscribeSound, soundVolume, () => DEFAULT_VOLUME)
}

/**
 * Liquid fill for a host element with a canvas inside. Pours once per element
 * when `active` turns true (e.g. when the data arrived); `enabled: false`
 * shows the full state at once (the app's once-per-login rule decides).
 */
export function useLiquidFill(
  hostRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { active, enabled = true, ...options }: PourOptions & { active: boolean; enabled?: boolean },
): Pick<PourHandle, 'touch'> {
  const handle = useRef<PourHandle | null>(null)
  const played = useRef(false)
  const { delayMs, fillMs, pourAt } = options
  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!active || !host || !canvas) return
    if (!enabled || played.current) {
      host.classList.add('bq-liquid--full')
      return
    }
    let done = false
    handle.current = pourLiquid(host, canvas, {
      delayMs,
      fillMs,
      pourAt,
      onDone: () => {
        done = true
        played.current = true
      },
    })
    return () => {
      handle.current?.stop()
      handle.current = null
      // stopped before it was full (StrictMode runs effects twice): pour again next time
      if (!done) played.current = false
    }
  }, [active, enabled, delayMs, fillMs, pourAt, hostRef, canvasRef])
  return { touch: (x, force) => handle.current?.touch(x, force) }
}
