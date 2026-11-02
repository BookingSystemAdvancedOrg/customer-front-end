import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'

/**
 * Dropdowns are always the native <select>: the platform's own picker on
 * phones, full keyboard and screen reader support. Styled in the brand look
 * (pill, chevron); where the browser supports customizable selects
 * (appearance: base-select) the open list gets the look too.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} {...rest} className={['bq-select', className].filter(Boolean).join(' ')} />
})
