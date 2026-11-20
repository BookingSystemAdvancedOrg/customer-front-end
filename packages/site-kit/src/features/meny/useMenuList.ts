import { useEffect, useState } from 'react'
import { isApiConfigured } from '../../shared/api'
import { useSite } from '../../shared/SiteContext'
import { useKeepTerms } from '../../shared/lang/LanguageContext'
import { DEFAULT_CATEGORIES, getPublicMenuWithCategories } from './menuApi'
import type { MenuCategory, MenuCategoryEntry, PublicMenuItem } from './menuApi'

/**
 * Hämtnings-/filtreringslogik för menyn: den publika
 * GET /locations/{id}/menu för den plats besökaren valt.
 *
 * Exakt en kategori är alltid vald (default platsens första) -
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
    categories: MenuCategoryEntry[]
    error: string | null
    attempt: number
  } | null>(null)
  const [chosen, setFilter] = useState<MenuCategory | null>(null)
  const [attempt, setAttempt] = useState(0)
  const current = result?.locationId === locationId && result.attempt === attempt ? result : null
  const items = current?.items ?? []
  const categories = current?.categories ?? DEFAULT_CATEGORIES
  const filter = chosen ?? categories[0]?.categoryId ?? 'starters'
  const error = current?.error ?? null
  const loading = configured && current === null

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    getPublicMenuWithCategories(locationId)
      .then((fetched) => {
        if (!cancelled) setResult({ locationId, attempt, ...fetched, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            locationId,
            attempt,
            items: [],
            categories: DEFAULT_CATEGORIES,
            error: err instanceof Error ? err.message : 'Menyn kunde inte hämtas.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [configured, locationId, attempt])

  /** Försök igen efter ett fel: visar laddningen och hämtar på nytt. */
  const retry = () => setAttempt((a) => a + 1)

  // Rätternas namn översätts aldrig (de är namn), inte heller i meningar som "Lägg till Kebab".
  useKeepTerms(items.map((it) => it.name))

  const visible = items
    .filter((it) => it.category === filter)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  return { configured, loading, error, retry, filter, setFilter, visible, items, categories }
}
