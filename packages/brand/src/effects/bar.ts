/**
 * For pages without React (booqy.se): sets a progress or meter Bar's value
 * (0..1) on markup that follows the Bar family's classes. React pages use
 * the Bar component instead.
 */
export function setBarValue(bar: HTMLElement, value: number, text?: string): void {
  const v = Math.min(1, Math.max(0, value))
  bar.style.setProperty('--bq-bar-value', v.toFixed(3))
  bar.setAttribute('aria-valuenow', String(Math.round(v * 100)))
  if (text !== undefined) {
    bar.setAttribute('aria-valuetext', text)
    const out = bar.querySelector<HTMLElement>('.bq-bar__value')
    if (out) out.textContent = text
  }
}
