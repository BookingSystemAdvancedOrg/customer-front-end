/**
 * Ikonerna för ljust (sol) och mörkt (måne) läge, i currentColor och samma
 * linjetjocklek. Samma teckning i admin, Booqy Console och på booqy.se.
 */

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...ICON}>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  )
}

export function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...ICON}>
      <path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z" />
    </svg>
  )
}

/** Högtalaren för klickljudet: med ljudvågor när ljudet är på. */
export function SoundIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...ICON}>
      <path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7.5 7.5 0 0 1 0 10.4" />
    </svg>
  )
}

/** Högtalaren utan ljud: ett kryss i stället för vågorna. */
export function MuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...ICON}>
      <path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </svg>
  )
}
