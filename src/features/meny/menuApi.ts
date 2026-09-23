import { apiGet, ApiError } from '../../shared/api'

/**
 * Klient mot backendens PUBLIKA meny-endpoint (openapi.yaml, Menu-taggen):
 *
 *   GET /locations/{id}/menu - aktiva rätter, ingen inloggning krävs.
 *
 * Det är den enda meny-rutt kundsajten använder. Adminrutterna
 * (/menu/items m.fl.) hör hemma i admin-front-end och finns medvetet inte
 * representerade här.
 */

export type MenuCategory = 'starters' | 'mains' | 'desserts' | 'drinks'

/** Visningsordning och svenska rubriker för menyns kategorier. */
export const CATEGORY_ORDER: MenuCategory[] = [
  'starters',
  'mains',
  'desserts',
  'drinks',
]

export const CATEGORY_LABEL: Record<MenuCategory, string> = {
  starters: 'Förrätter',
  mains: 'Varmrätter',
  desserts: 'Efterrätter',
  drinks: 'Drycker',
}

/**
 * Den publika menyns kundvända form - inga auditfält. `active` är med som
 * frivilligt fält: backend-teamet har beskrivit en variant där samma rutt
 * kan bära flaggan, och då ska den respekteras i stället för att antas sann.
 */
export interface PublicMenuItem {
  menuItemId: string
  name: string
  description: string
  price: number
  category: MenuCategory
  imageKey: string
  active?: boolean
}

/* --- Bildvisning ---------------------------------------------------------- */

/**
 * Bas-URL (CDN/CloudFront) för menybilder. API:t returnerar bara S3-nyckeln
 * (prefixad med menu-images/), aldrig en färdig URL - utan variabeln visas
 * platshållaren i stället.
 */
export const MENU_IMAGE_BASE_URL = (
  import.meta.env.VITE_MENU_IMAGE_BASE_URL as string | undefined
)?.replace(/\/+$/, '')

export function menuImageUrl(imageKey: string): string | null {
  if (!imageKey.trim() || !MENU_IMAGE_BASE_URL) return null
  return `${MENU_IMAGE_BASE_URL}/${imageKey}`
}

/* --- Felöversättning ------------------------------------------------------ */

function toFriendlyMenuError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new Error('Menyn tog för lång tid att hämta - försök igen.')
  }
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err : new Error('Ett okänt fel inträffade.')
  }

  console.error(`[Menu] ${err.status}: ${err.message}`)

  switch (err.status) {
    case 404:
      return new ApiError(404, 'Menyn kunde inte hittas.')
    case 429:
      return new ApiError(429, 'För många förfrågningar - vänta en stund.')
    case 503:
      return new ApiError(503, 'Menyn är tillfälligt otillgänglig. Försök igen.')
    default:
      return new ApiError(
        err.status,
        'Menyn kunde inte hämtas just nu. Försök igen om en stund.',
      )
  }
}

/* --- HTTP ----------------------------------------------------------------- */

/**
 * Publika menyn för en plats. Inaktiva rätter filtreras bort även om
 * servern skulle skicka med dem - kunder ska aldrig se avstängda rätter.
 */
export async function getPublicMenu(
  locationId: string,
): Promise<PublicMenuItem[]> {
  try {
    const res = await apiGet<{ items?: PublicMenuItem[] }>(
      `/locations/${encodeURIComponent(locationId)}/menu`,
    )
    return (res.items ?? []).filter((item) => item.active !== false)
  } catch (err) {
    throw toFriendlyMenuError(err)
  }
}

/** Grupperar rätterna per kategori i visningsordning, sorterade på namn. */
export function groupByCategory(
  items: PublicMenuItem[],
): { category: MenuCategory; items: PublicMenuItem[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: items
      .filter((item) => item.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
  })).filter((group) => group.items.length > 0)
}

/** Pris i kr med svensk formatering: heltal utan decimaler, annars två. */
export function formatPrice(price: number): string {
  const formatted = Number.isInteger(price)
    ? String(price)
    : price.toLocaleString('sv-SE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
  return `${formatted} kr`
}
