import { MuteIcon, SoundIcon } from './ThemeIcons'
import { useSound } from './sound'

/**
 * Knappen i sidfoten som stänger av eller slår på klickljudet, som på
 * booqy.se. En tryckknapp (aria-pressed): nedtryckt = ljudet på. Texten
 * visar läget som gäller.
 */
export function SoundToggle({ className = '' }: { className?: string }) {
  const [on, toggle] = useSound()
  return (
    <button
      type="button"
      className={`sound-toggle${className ? ` ${className}` : ''}`}
      aria-pressed={on}
      onClick={toggle}
    >
      {on ? <SoundIcon /> : <MuteIcon />}
      <span>{on ? 'Klickljud på' : 'Klickljud av'}</span>
    </button>
  )
}
