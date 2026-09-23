import { useEffect, useState } from 'react'
import { isApiConfigured } from '../../shared/api'
import { isLocationConfigured, LOCATION_ID } from '../../shared/config'
import { CATEGORY_ORDER, getPublicMenu } from './menuApi'
import type { MenuCategory, PublicMenuItem } from './menuApi'

/**
 * Delad hämtnings-/filtreringslogik för Meny och Beställ mat - båda visar
 * samma publika GET /locations/{id}/menu, bara med olika UI (Meny är
 * skrivskyddad, Beställ mat lägger till "+ Lägg till"-knappen).
 *
 * Exakt en kategori är alltid vald (default den första i CATEGORY_ORDER) -
 * matchar sidopanel-/dropdown-navigeringen i CategoryNav, där man alltid
 * står på en kategori i taget, aldrig ett "visa alla"-läge.
 */
export function useMenuList() {
  const configured = isApiConfigured() && isLocationConfigured()
  const [items, setItems] = useState<PublicMenuItem[]>([])
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MenuCategory>(CATEGORY_ORDER[0])

  useEffect(() => {
    if (!configured || !LOCATION_ID) return
    let cancelled = false
    getPublicMenu(LOCATION_ID)
      .then((fetched) => {
        if (!cancelled) setItems(fetched)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Menyn kunde inte hämtas.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [configured])

  const visible = items
    .filter((it) => it.category === filter)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  return { configured, loading, error, filter, setFilter, visible }
}
