import { siteKitConfig } from '../../config'
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

/** Ett categoryId bland platsens kategorier (de fyra standard tills ägaren ändrar). */
export type MenuCategory = string

export interface MenuCategoryEntry {
  categoryId: string
  name: string
}

/** Standardkategorierna: visningsordning och svenska rubriker när API:t inte skickar platsens egna. */
export const CATEGORY_ORDER: MenuCategory[] = [
  'starters',
  'mains',
  'desserts',
  'drinks',
]

export const CATEGORY_LABEL: Record<string, string> = {
  starters: 'Förrätter',
  mains: 'Varmrätter',
  desserts: 'Efterrätter',
  drinks: 'Drycker',
}

export const DEFAULT_CATEGORIES: MenuCategoryEntry[] = CATEGORY_ORDER.map((categoryId) => ({
  categoryId,
  name: CATEGORY_LABEL[categoryId],
}))

/** EU:s 14 allergener, samma koder som API:t, med svenska namn. */
export const ALLERGEN_LABEL: Record<string, string> = {
  gluten: 'Gluten', crustaceans: 'Kräftdjur', eggs: 'Ägg', fish: 'Fisk', peanuts: 'Jordnötter', soy: 'Soja',
  milk: 'Mjölk', nuts: 'Nötter', celery: 'Selleri', mustard: 'Senap', sesame: 'Sesamfrön',
  sulphites: 'Svaveldioxid och sulfiter', lupin: 'Lupin', molluscs: 'Blötdjur',
}

/** "Innehåller: Gluten, Mjölk", eller null utan allergener. */
export function allergenText(allergens: string[] | undefined): string | null {
  const names = (allergens ?? []).map((a) => ALLERGEN_LABEL[a]).filter(Boolean)
  return names.length ? `Innehåller: ${names.join(', ')}` : null
}

/** Ett tillval och dess pristillägg i kr. */
export interface OptionChoice {
  name: string
  price: number
}

/** En grupp tillval (Storlek, Extra ...). */
export interface OptionGroup {
  name: string
  required: boolean
  maxChoices: number
  choices: OptionChoice[]
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
  /** null = ingen bild (platshållaren visas). */
  imageKey: string | null
  active?: boolean
  /** EU-allergener (koder, se ALLERGEN_LABEL). */
  allergens?: string[]
  /** Tillval gästen väljer vid beställning. */
  options?: OptionGroup[]
  /** Innehåller alkohol: går inte att beställa för avhämtning. */
  alcohol?: boolean
  /** Bildens fokuspunkt i hela procent (admin väljer den); saknas = mitten. */
  imageFocus?: { x: number; y: number } | null
}

/* --- Bildvisning ---------------------------------------------------------- */

/**
 * Bas-URL (CDN/CloudFront) för menybilder. API:t returnerar bara S3-nyckeln
 * (prefixad med menu-images/), aldrig en färdig URL - utan variabeln visas
 * platshållaren i stället.
 */
export function menuImageBaseUrl(): string | undefined {
  return siteKitConfig().menuImageBaseUrl?.replace(/\/+$/, '') || undefined
}

/**
 * CSS object-position för rättens bild: den del restaurangen valt ska synas
 * när tallriken beskär fotot. Saknas eller är värdet trasigt gäller mitten.
 */
export function menuImagePosition(focus: PublicMenuItem['imageFocus']): string {
  const axis = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 50)
  return focus ? `${axis(focus.x)}% ${axis(focus.y)}%` : '50% 50%'
}

export function menuImageUrl(imageKey: string | null | undefined): string | null {
  const base = menuImageBaseUrl()
  if (!imageKey?.trim() || !base) return null
  return `${base}/${imageKey}`
}

/* --- Felöversättning ------------------------------------------------------ */

function toFriendlyMenuError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new Error('Menyn tog för lång tid att hämta - försök igen.')
  }
  if (!(err instanceof ApiError)) {
    // Nätverksfel ("Failed to fetch", "Load failed") och annat: aldrig webbläsarens engelska text.
    return new Error('Menyn kunde inte hämtas. Kontrollera anslutningen och försök igen.')
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
  return (await getPublicMenuWithCategories(locationId)).items
}

/** Rätterna och platsens kategorier (standard när ett äldre API inte skickar dem). */
export async function getPublicMenuWithCategories(
  locationId: string,
): Promise<{ items: PublicMenuItem[]; categories: MenuCategoryEntry[] }> {
  try {
    const res = await apiGet<{ items?: PublicMenuItem[]; categories?: MenuCategoryEntry[] }>(
      `/locations/${encodeURIComponent(locationId)}/menu`,
    )
    return {
      items: (res.items ?? []).filter((item) => item.active !== false),
      categories: res.categories?.length ? res.categories : DEFAULT_CATEGORIES,
    }
  } catch (err) {
    throw toFriendlyMenuError(err)
  }
}

/**
 * Grupperar rätterna per kategori i platsens ordning, sorterade på namn.
 * Rätter vars kategori inte finns bland platsens hamnar sist under Övrigt.
 */
export function groupByCategory(
  items: PublicMenuItem[],
  categories: MenuCategoryEntry[] = DEFAULT_CATEGORIES,
): { category: MenuCategory; label: string; items: PublicMenuItem[] }[] {
  const known = new Set(categories.map((c) => c.categoryId))
  const sorted = (list: PublicMenuItem[]) => list.slice().sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  return [
    ...categories.map((c) => ({
      category: c.categoryId,
      label: c.name,
      items: sorted(items.filter((item) => item.category === c.categoryId)),
    })),
    { category: 'ovrigt', label: 'Övrigt', items: sorted(items.filter((item) => !known.has(item.category))) },
  ].filter((group) => group.items.length > 0)
}

/** Tillvalens pristillägg i öre för gästens val (servern räknar likadant). */
export function optionsOre(item: PublicMenuItem, picks: { group: string; choice: string }[]): number {
  let sum = 0
  for (const pick of picks) {
    const choice = item.options?.find((g) => g.name === pick.group)?.choices.find((c) => c.name === pick.choice)
    if (choice) sum += Math.round(choice.price * 100)
  }
  return sum
}

/**
 * Är gästens val giltiga för rätten: varje grupp och val finns, högst
 * maxChoices per grupp och minst ett val i de grupper som krävs.
 */
export function validPicks(item: PublicMenuItem, picks: { group: string; choice: string }[]): boolean {
  const groups = item.options ?? []
  for (const pick of picks) {
    if (!groups.some((g) => g.name === pick.group && g.choices.some((c) => c.name === pick.choice))) return false
  }
  return groups.every((g) => {
    const mine = picks.filter((p) => p.group === g.name)
    return mine.length <= g.maxChoices && new Set(mine.map((p) => p.choice)).size === mine.length && (!g.required || mine.length > 0)
  })
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
