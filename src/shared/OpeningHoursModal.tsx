import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocationInfo } from './useLocationInfo'

/**
 * Öppettider som modal: den valda platsens öppettider per veckodag
 * (intilliggande dagar med samma tider ihopslagna).
 */
export function OpeningHoursModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { openingHours, specialDays } = useLocationInfo()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="opening-hours-modal-root" ref={panelRef}>
      <button
        type="button"
        className="opening-hours-modal-backdrop"
        aria-label="Stäng öppettider"
        onClick={onClose}
      />
      <div
        className="opening-hours-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="opening-hours-modal-header">
          <h2 id={titleId} className="opening-hours-modal-heading">
            Öppettider
          </h2>
          <button
            type="button"
            className="opening-hours-modal-close"
            onClick={onClose}
            aria-label="Stäng öppettider"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <table className="opening-hours-table">
          <tbody>
            {openingHours.map((row) => (
              <tr key={row.days}>
                <th scope="row">{row.days}</th>
                <td>{row.hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {specialDays.length > 0 && (
          <>
            <h3 className="opening-hours-special-heading">Avvikande öppettider</h3>
            <table className="opening-hours-table">
              <tbody>
                {specialDays.map((row) => (
                  <tr key={row.date}>
                    <th scope="row">{row.label}</th>
                    <td>{row.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
