import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'

/**
 * Native <select> styled in the brand look (pill, chevron).
 *
 * @deprecated Owner decision 2026-11-14: no dropdown opens the system menu.
 * The guest site uses `Select` from `@booqy/site-kit`; admin and console get
 * their own Booqy dropdown in their own repos. Kept only so their vendored
 * copies of this package still build; replace or remove it together with them.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} {...rest} className={['bq-select', className].filter(Boolean).join(' ')} />
})
