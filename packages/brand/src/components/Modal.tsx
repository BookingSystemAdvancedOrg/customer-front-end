import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Buttons under the content (an action Bar). */
  footer?: ReactNode
  closeLabel?: string
  size?: 'md' | 'wide'
}

/**
 * A dialog on the native <dialog> (showModal): focus moves in and is kept
 * there, Escape closes, the page behind is inert and focus returns to what
 * opened it. A press on the scrim closes too.
 */
export function Modal({ open, title, onClose, children, footer, closeLabel = 'Stäng', size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`bq-modal bq-modal--${size}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => {
        // jsdom and older engines without showModal: Escape still closes
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="bq-modal__panel">
          <header className="bq-modal__head">
            <h2 id={titleId} className="bq-modal__title">
              {title}
            </h2>
            <button type="button" className="bq-modal__close" aria-label={closeLabel} onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div className="bq-modal__body">{children}</div>
          {footer && <div className="bq-modal__foot">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
