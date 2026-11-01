import { forwardRef } from 'react'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Own {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  /** Full width (forms on phones). */
  wide?: boolean
  /** Work in flight: disabled, aria-busy and the busy label shown instead. */
  busy?: boolean
  busyLabel?: ReactNode
}

export type ButtonProps = Own & ButtonHTMLAttributes<HTMLButtonElement>
export type LinkButtonProps = Own & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

function classes({ variant = 'secondary', size = 'md', wide, busy }: Own, extra?: string) {
  return ['bq-btn', `bq-btn--${variant}`, `bq-btn--${size}`, wide && 'bq-btn--wide', busy && 'bq-btn--busy', extra].filter(Boolean).join(' ')
}

/** The one button. Pills in every app; primary is the espresso pill (or the restaurant colour on guest sites). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, wide, busy, busyLabel, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={classes({ variant, size, wide, busy }, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && busyLabel ? busyLabel : children}
    </button>
  )
})

/** A link that looks like a button (navigation, not an action). */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton({ variant, size, wide, busy, busyLabel, className, children, ...rest }, ref) {
  return (
    <a ref={ref} className={classes({ variant, size, wide, busy }, className)} {...rest}>
      {busy && busyLabel ? busyLabel : children}
    </a>
  )
})
