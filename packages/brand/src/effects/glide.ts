/**
 * The glide pill: in a group where one of several options is chosen
 * (tab Bar, nav Bar, segmented choice) the chosen pill glides and stretches
 * to the new option instead of jumping, as on booqy.se.
 *
 * Mark the container with data-bq-glide="track" (sand track + pill) or
 * "bare" (pill only). This measures the chosen child and sets
 * data-bq-glide-on, data-bq-glide-placed and --bq-glide-x/-y/-w/-h on the
 * container; React never touches those. The style lives in effects.css.
 */
const ACTIVE = "[aria-selected='true'], [aria-current='page'], [aria-pressed='true'], [aria-checked='true']"

function place(group: HTMLElement) {
  const items = Array.from(group.querySelectorAll<HTMLElement>(':scope > button, :scope > a, :scope > li > a, :scope > li > button'))
  const on = items.find((c) => c.matches(ACTIVE))
  if (!on || !on.getClientRects().length) {
    delete group.dataset.bqGlideOn
    return
  }
  // layout offsets, not getBoundingClientRect: the press squeeze scales the
  // button for a moment and the pill would aim at the smaller box. The group
  // is position: relative and list items are static, so offsets count from it.
  group.style.setProperty('--bq-glide-x', `${on.offsetLeft}px`)
  group.style.setProperty('--bq-glide-y', `${on.offsetTop}px`)
  group.style.setProperty('--bq-glide-w', `${on.offsetWidth}px`)
  group.style.setProperty('--bq-glide-h', `${on.offsetHeight}px`)
  if (group.dataset.bqGlideOn === undefined) {
    // the first time the pill lands in place without sliding in from the edge
    group.dataset.bqGlideOn = ''
    requestAnimationFrame(() => requestAnimationFrame(() => {
      group.dataset.bqGlidePlaced = ''
    }))
  }
}

let queued = false
function placeAll() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    document.querySelectorAll<HTMLElement>('[data-bq-glide]').forEach(place)
  })
}

let installed = false

/** Listens once on the page; every glide group that appears or changes is placed again. Idempotent. */
export function installGlide(): void {
  if (installed || typeof document === 'undefined' || typeof MutationObserver === 'undefined' || typeof requestAnimationFrame !== 'function') return
  installed = true
  new MutationObserver(placeAll).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-selected', 'aria-current', 'aria-pressed', 'aria-checked'],
  })
  window.addEventListener('resize', placeAll)
  void document.fonts?.ready.then(placeAll)
  placeAll()
}

/** Places the groups again now, e.g. after a font or layout change the observer cannot see. */
export function refreshGlide(): void {
  if (installed) placeAll()
}
