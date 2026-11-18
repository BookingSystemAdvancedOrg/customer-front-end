import type { ReactNode } from 'react'

/**
 * Den enda tillbaka-knappen på gästsidan: en tydlig sekundär pille med pil åt
 * vänster, överst till vänster i steget (i en knapprad sist). Stilen ligger i
 * styles/components.css (.back-btn). BackButton.test.tsx stoppar textlänkar.
 */
export function BackButton({
  onClick,
  children = 'Tillbaka',
  disabled,
  className = '',
}: {
  onClick: () => void
  children?: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button type="button" className={`btn-secondary back-btn ${className}`.trim()} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      <span>{children}</span>
    </button>
  )
}
