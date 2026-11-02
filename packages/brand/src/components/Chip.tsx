import type { ReactNode } from 'react'
import type { Tone } from './Bar'

export type ChipTone = Tone | 'neutral'

export interface ChipProps {
  /** The status as text ("Giltig", "Insläppt", "Bokad", "Återuppringning"): colour is never the only signal. */
  children: ReactNode
  tone?: ChipTone
  /** A decorative icon before the text (hidden from assistive tech). */
  icon?: ReactNode
  className?: string
}

/** A status chip: ticket status, call outcome. Uses the banner tone pairs. */
export function Chip({ children, tone = 'neutral', icon, className }: ChipProps) {
  return (
    <span className={['bq-chip', `bq-chip--${tone}`, className].filter(Boolean).join(' ')}>
      {icon && (
        <span className="bq-chip__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  )
}
