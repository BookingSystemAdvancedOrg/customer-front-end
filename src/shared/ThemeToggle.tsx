import { MoonIcon, SunIcon } from './ThemeIcons'
import { useTheme } from './theme'

/**
 * Knappen i sidhuvudet som byter mellan ljust och mörkt läge. En tryckknapp
 * (aria-pressed): nedtryckt = mörkt läge. Ikonen visar läget som gäller
 * (sol = ljust, måne = mörkt) och tonar över till den andra vid byte; med
 * "minska rörelse" byts den direkt. Namnet för skärmläsare och
 * verktygstipset är samma: "Mörkt läge".
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className={`theme-toggle${className ? ` ${className}` : ''}`}
      aria-pressed={dark}
      aria-label="Mörkt läge"
      title="Mörkt läge"
      onClick={toggle}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <SunIcon className="theme-toggle-sun" />
        <MoonIcon className="theme-toggle-moon" />
      </span>
    </button>
  )
}
