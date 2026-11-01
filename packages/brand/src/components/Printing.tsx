/**
 * The loading indicator: a receipt printing. A slip feeds out of the slot and
 * its lines print one at a time, over and over, until the data is here.
 * `inline` sits in a line of text, `block` (default) on its own row in a card,
 * `screen` fills the page. Reduced motion: a still slip.
 */
export function Printing({ label = 'Hämtar', variant = 'block' }: { label?: string; variant?: 'inline' | 'block' | 'screen' }) {
  const text = label.endsWith('…') ? label : `${label}…`
  return (
    <span className={`bq-printing bq-printing--${variant}`} role="status" aria-live="polite">
      <span className="bq-printing__printer" aria-hidden="true">
        <span className="bq-printing__slot" />
        <span className="bq-printing__slip">
          <span className="bq-printing__line bq-printing__line--head" />
          <span className="bq-printing__line" />
          <span className="bq-printing__line bq-printing__line--short" />
          <span className="bq-printing__line" />
          <span className="bq-printing__line bq-printing__line--sum" />
        </span>
      </span>
      <span className="bq-printing__label">{text}</span>
    </span>
  )
}
