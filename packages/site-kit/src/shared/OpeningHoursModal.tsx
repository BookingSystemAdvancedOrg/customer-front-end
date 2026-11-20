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
  const closeRef = useRef<HTMLButtonElement>(null)
  // Senaste onClose utan att effekten körs om (och flyttar fokus) vid varje render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Fokus in i dialogen när den öppnas, Tab stannar i panelen, och fokus
  // tillbaka till knappen som öppnade den när den stängs.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && panelRef.current.contains(active)
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = prev
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="opening-hours-modal-root">
      <button
        type="button"
        className="opening-hours-modal-backdrop"
        aria-label="Stäng öppettider"
        onClick={onClose}
      />
      <div
        ref={panelRef}
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
            ref={closeRef}
            type="button"
            className="opening-hours-modal-close"
            onClick={onClose}
            aria-label="Stäng öppettider"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <table className="opening-hours-table" dir="ltr">
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
            <table className="opening-hours-table" dir="ltr">
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
