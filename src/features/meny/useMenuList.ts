import { useEffect, useState } from 'react'
import { isApiConfigured } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { CATEGORY_ORDER, getPublicMenu } from './menuApi'
import type { MenuCategory, PublicMenuItem } from './menuApi'

/**
 * Hämtnings-/filtreringslogik för menyn: den publika
 * GET /locations/{id}/menu för den plats besökaren valt.
 *
 * Exakt en kategori är alltid vald (default den första i CATEGORY_ORDER) -
 * matchar sidopanel-/dropdown-navigeringen i CategoryNav, där man alltid
 * står på en kategori i taget, aldrig ett "visa alla"-läge.
 */
export function useMenuList() {
  const { location } = useSite()
  const locationId = location.locationId
  const configured = isApiConfigured()
  const [result, setResult] = useState<{
    locationId: string
    items: PublicMenuItem[]
    error: string | null
  } | null>(null)
  const [filter, setFilter] = useState<MenuCategory>(CATEGORY_ORDER[0])
  const current = result?.locationId === locationId ? result : null
  const items = current?.items ?? []
  const error = current?.error ?? null
  const loading = configured && current === null

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    getPublicMenu(locationId)
      .then((fetched) => {
        if (!cancelled) setResult({ locationId, items: fetched, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            locationId,
            items: [],
            error: err instanceof Error ? err.message : 'Menyn kunde inte hämtas.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [configured, locationId])

  const visible = items
    .filter((it) => it.category === filter)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  return { configured, loading, error, filter, setFilter, visible, items }
}
