import { useState } from 'react'

/** Beställ > kassan: "Har du ett presentkort?". Koden dras när beställningen skickas; resten betalas med kort. */
export default function GiftCardField({ value, onChange }: { value: string; onChange: (v: string) => void; totalOre: number }) {
  const [open, setOpen] = useState(Boolean(value))
  if (!open) {
    return (
      <button type="button" className="btn-secondary btn-small" onClick={() => setOpen(true)}>Har du ett presentkort?</button>
    )
  }
  return (
    <label className="booking-field">
      <span>Presentkortskod</span>
      <input autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <small className="cell-muted">Det som finns på kortet dras av. Resten betalar du med kort.</small>
    </label>
  )
}
