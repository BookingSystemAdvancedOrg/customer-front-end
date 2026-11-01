import { cloneElement, isValidElement, useId } from 'react'
import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react'

export interface FieldProps {
  label: ReactNode
  /** One control: an <input>, <textarea> or the brand Select. */
  children: ReactElement<Record<string, unknown>>
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
}

/**
 * A labelled control: the label points at the control, and the hint or
 * error is read with it (aria-describedby); an error also sets aria-invalid.
 * After a refused save, focus the first [aria-invalid] control.
 */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const auto = useId()
  const control = isValidElement(children) ? children : null
  const id = (control?.props.id as string | undefined) ?? auto
  const msgId = `${id}-msg`
  const described = [control?.props['aria-describedby'] as string | undefined, error || hint ? msgId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <div className={['bq-field', error ? 'bq-field--error' : '', className].filter(Boolean).join(' ')}>
      <label className="bq-field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="bq-field__req" aria-hidden="true">
            {' '}*
          </span>
        )}
      </label>
      {control
        ? cloneElement(control, { id, required: required || control.props.required, 'aria-invalid': error ? true : control.props['aria-invalid'], 'aria-describedby': described })
        : children}
      {error ? (
        <span id={msgId} className="bq-field__msg">
          {error}
        </span>
      ) : (
        hint && (
          <span id={msgId} className="bq-field__hint">
            {hint}
          </span>
        )
      )}
    </div>
  )
}

/** The text input in the brand look; use inside Field. */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={['bq-input', props.className].filter(Boolean).join(' ')} />
}
