import { useEffect, useRef } from 'react'
import { countUp, parseStatValue } from '../effects/countUp'

/**
 * A figure that counts up: from zero when it first shows (`reveal`, the
 * default) and from where it stood when the value changes later. `children`
 * is the formatted text ("1 250 kr", "6,9 %"); the last frame is exactly
 * that text. Digits keep one width so the row does not jump.
 */
export function CountUp({ children, reveal = true, delayMs = 0, className }: { children: string | number; reveal?: boolean; delayMs?: number; className?: string }) {
  const text = String(children)
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = parseStatValue(text)?.value ?? null
    const from = shown.current ?? (reveal ? 0 : target ?? 0)
    let current = from
    const cancel = countUp(el, text, {
      from,
      delayMs,
      onFrame: (v) => {
        current = v
      },
      onDone: (v) => {
        current = v
      },
    })
    return () => {
      cancel()
      // interrupted (StrictMode, or the value changed): count on from where it stood
      shown.current = current
    }
  }, [text, reveal, delayMs])

  return (
    <span ref={ref} className={`bq-count${className ? ` ${className}` : ''}`}>
      {text}
    </span>
  )
}
