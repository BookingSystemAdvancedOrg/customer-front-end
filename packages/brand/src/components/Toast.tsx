import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Bar } from './Bar'
import { dismissToast, subscribeToasts, toastList } from './toastStore'
import type { ToastItem } from './toastStore'

/**
 * Toasts: short confirmations that need no answer ("Sparat", "Länken
 * kopierad"), shown as banner Bars in a corner region. They leave after
 * `timeoutMs`, wait while hovered or focused, and can always be dismissed.
 * Anything the user must act on belongs in a banner Bar on the page.
 */
function ToastRow({ item, dismissLabel }: { item: ToastItem; dismissLabel: string }) {
  const [paused, setPaused] = useState(false)
  const left = useRef(item.timeoutMs)
  useEffect(() => {
    if (paused || item.timeoutMs <= 0) return
    const started = Date.now()
    const t = window.setTimeout(() => dismissToast(item.id), left.current)
    return () => {
      window.clearTimeout(t)
      left.current -= Date.now() - started
    }
  }, [paused, item])
  return (
    <li onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <Bar variant="banner" tone={item.tone} onDismiss={() => dismissToast(item.id)} dismissLabel={dismissLabel} className="bq-toast">
        {item.message}
      </Bar>
    </li>
  )
}

/** Mount once per app, near the root. */
export function Toaster({ label = 'Aviseringar', dismissLabel = 'Stäng' }: { label?: string; dismissLabel?: string }) {
  const list = useSyncExternalStore(subscribeToasts, toastList, toastList)
  return (
    <section className="bq-toaster" aria-label={label}>
      <ol>
        {list.map((item) => (
          <ToastRow key={item.id} item={item} dismissLabel={dismissLabel} />
        ))}
      </ol>
    </section>
  )
}
