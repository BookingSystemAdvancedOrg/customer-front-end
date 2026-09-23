import { CATEGORY_LABEL, CATEGORY_ORDER } from './menuApi'
import type { MenuCategory } from './menuApi'

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
}: {
  filter: MenuCategory
  onSelect: (category: MenuCategory) => void
}) {
  return (
    <>
      <nav className="category-sidebar" aria-label="Filtrera på kategori">
        <p className="category-sidebar-kicker">Kategori</p>
        <ul>
          {CATEGORY_ORDER.map((category) => (
            <li key={category}>
              <button
                type="button"
                className={`category-sidebar-item${filter === category ? ' active' : ''}`}
                aria-pressed={filter === category}
                onClick={() => onSelect(category)}
              >
                {CATEGORY_LABEL[category]}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="category-dropdown">
        <label htmlFor="category-select" className="category-dropdown-label">
          Välj kategori
        </label>
        <select
          id="category-select"
          value={filter}
          onChange={(e) => onSelect(e.target.value as MenuCategory)}
        >
          {CATEGORY_ORDER.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABEL[category]}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
