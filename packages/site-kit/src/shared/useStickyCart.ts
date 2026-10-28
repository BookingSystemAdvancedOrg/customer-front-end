import { useCallback, useRef } from 'react'

/**
 * Brickan på skrivbord: ingen egen rullning. Den följer sidan och stannar
 * överst när den får plats i fönstret; är den högre rullar den med sidan
 * tills underkanten (knappen) syns och stannar där. CSS:en behöver höjden
 * (--cart-h) för det, så den mäts här när innehållet ändras. En callback-ref,
 * så att det fungerar även när brickan dyker upp först efter laddningen.
 */
export function useStickyCart<T extends HTMLElement>() {
  const observer = useRef<ResizeObserver | null>(null)
  return useCallback((el: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(() => el.style.setProperty('--cart-h', `${el.offsetHeight}px`))
    observer.current.observe(el)
  }, [])
}
