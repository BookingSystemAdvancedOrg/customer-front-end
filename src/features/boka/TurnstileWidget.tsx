import { useEffect, useRef, useState } from 'react'

/**
 * Säkerhetskontrollen på bokningsformuläret (Cloudflare Turnstile): visar
 * plattformens widget och lämnar dess token till sidan, som skickar den med
 * bokningen. Backend kontrollerar token hos Cloudflare (shared/turnstile.py).
 *
 * En token gäller en bokning (och i 5 minuter - widgeten hämtar en ny själv
 * när den går ut): efter varje bokningsförsök ändrar sidan `resetKey` så
 * att widgeten tar fram en ny.
 */

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loader: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loader) {
    loader = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
      script.onerror = () => {
        loader = null
        script.remove()
        reject(new Error('turnstile'))
      }
      document.head.appendChild(script)
    })
  }
  return loader
}

export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
  action = 'booking',
  appearance = 'always',
}: {
  siteKey: string
  /** Formuläret widgeten sitter på - servern godtar bara rätt sort. */
  action?: 'booking' | 'order' | 'catering' | 'signup'
  /** 'interaction-only': syns bara om Cloudflare behöver fråga besökaren. */
  appearance?: 'always' | 'interaction-only'
  /** Ändras efter varje bokningsförsök - den gamla token är förbrukad. */
  resetKey: number
  onToken: (token: string | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  const lastReset = useRef(resetKey)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    onTokenRef.current = onToken
  })

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          language: 'sv',
          'refresh-expired': 'auto',
          appearance,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      // Skriptet gick inte att ladda, eller widgeten gick inte att visa.
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
      // Widgetens token följer inte med till nästa gång den visas.
      onTokenRef.current(null)
    }
  }, [siteKey, action, appearance])

  useEffect(() => {
    if (lastReset.current === resetKey) return
    lastReset.current = resetKey
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
  }, [resetKey])

  if (failed) {
    return (
      <p className="notice error" role="alert">
        Säkerhetskontrollen kunde inte laddas. Ladda om sidan och försök igen.
      </p>
    )
  }
  return <div className="booking-turnstile" ref={container} />
}
