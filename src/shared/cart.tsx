import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CartContext } from './CartContext'
import type { CartContextValue, CartItem } from './CartContext'

/**
 * Varukorgen (Figma: menu-page, "Varukorg"-knappen + "+ Lägg till" på
 * korten). Helt klientsidig: backend har ingen beställnings-endpoint än,
 * så korgen är en minneslista som sparas i localStorage som ren bekvämlighet
 * för besökaren. Inget skickas någonstans.
 */

const STORAGE_KEY = 'kalla-cart'

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Lagrad data är opålitlig (gammal version, manuellt mixtrad) — släpp
    // igenom bara poster med rätt form, och priser sätts ändå om från
    // API-datat när något läggs till.
    return parsed.filter(
      (it): it is CartItem =>
        typeof it === 'object' &&
        it !== null &&
        typeof (it as CartItem).menuItemId === 'string' &&
        typeof (it as CartItem).name === 'string' &&
        typeof (it as CartItem).price === 'number' &&
        Number.isFinite((it as CartItem).price) &&
        typeof (it as CartItem).quantity === 'number' &&
        (it as CartItem).quantity > 0,
    )
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Avstängd localStorage ska inte krascha korgen.
    }
  }, [items])

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, it) => sum + it.quantity, 0)
    const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0)
    return {
      items,
      count,
      total,
      add(item) {
        setItems((prev) => {
          const existing = prev.find((it) => it.menuItemId === item.menuItemId)
          if (existing) {
            return prev.map((it) =>
              it.menuItemId === item.menuItemId
                ? { ...it, quantity: it.quantity + 1 }
                : it,
            )
          }
          return [...prev, { ...item, quantity: 1 }]
        })
      },
      setQuantity(menuItemId, quantity) {
        setItems((prev) =>
          quantity <= 0
            ? prev.filter((it) => it.menuItemId !== menuItemId)
            : prev.map((it) =>
                it.menuItemId === menuItemId ? { ...it, quantity } : it,
              ),
        )
      },
      clear() {
        setItems([])
      },
    }
  }, [items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
