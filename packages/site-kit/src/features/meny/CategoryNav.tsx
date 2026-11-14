import { Select } from '../../shared/Select'
import { DEFAULT_CATEGORIES } from './menuApi'
import type { MenuCategory, MenuCategoryEntry } from './menuApi'

/**
 * Kategorival för Meny och Beställ mat. Renderar BÅDA varianterna samtidigt
 * - en sidopanel (skrivbord) och en dropdown (mobil) - och låter CSS
 * (@media max-width: 1073px, samma brytpunkt som headerns hamburgermeny)
 * växla vilken som syns. Enklare och mer robust än att detektera
 * skärmbredd i JS, och undviker ett omflöde när fönstret ändras.
 *
 * Båda är `position: sticky` mot `var(--header-h)` (headerns riktiga,
 * uppmätta höjd - se CustomerLayout) så de följer med i scroll utan att
 * hamna bakom den sticky headern ovanför.
 */
export function CategoryNav({
  filter,
  onSelect,
  categories = DEFAULT_CATEGORIES,
}: {
  filter: MenuCategory
  onSelect: (category: MenuCategory) => void
  /** Platsens kategorier (useMenuList); standard utan. */
  categories?: MenuCategoryEntry[]
}) {
  return (
    <>
      <nav className="category-sidebar" aria-label="Filtrera på kategori">
        <p className="category-sidebar-kicker">Kategori</p>
        <ul>
          {categories.map(({ categoryId: category, name }) => (
            <li key={category}>
              <button
                type="button"
                className={`category-sidebar-item${filter === category ? ' active' : ''}`}
                aria-pressed={filter === category}
                onClick={() => onSelect(category)}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="category-dropdown">
        <label htmlFor="category-select" className="category-dropdown-label">
          Välj kategori
        </label>
        <Select
          id="category-select"
          value={filter}
          onChange={(v) => onSelect(v as MenuCategory)}
          options={categories.map(({ categoryId, name }) => ({ value: categoryId, label: name }))}
        />
      </div>
    </>
  )
}
