import { prefersReducedMotion } from '../../shared/glide'

/** Hur länge klickeffekten på ett valt bord pågår innan sidan rullar vidare. */
export const PICK_EFFECT_MS = 500

/**
 * Klickeffekten när gästen väljer bord (2D och 3D): bordet poppar (snabb
 * uppskalning som sätter sig), en ring sprider sig ut från det och bordets
 * knapp i listan under lyser upp samtidigt. Web Animations, så samma bord
 * kan klickas igen och effekten börjar om. Ingenting med reducerad rörelse.
 */
export function playPickEffect(root: ParentNode | null | undefined, tableIds: string[], chip?: HTMLElement | null): void {
  if (!root || prefersReducedMotion()) return
  const timing = { duration: PICK_EFFECT_MS, easing: 'cubic-bezier(.2,.8,.2,1)' }
  for (const id of tableIds) {
    const table = root.querySelector<HTMLElement | SVGElement>(`[data-table-id="${CSS.escape(id)}"]`)
    if (!table || typeof table.animate !== 'function') continue
    const body = table.querySelector<HTMLElement | SVGElement>('.f3d-table-body') ?? table
    body.animate([{ scale: '1' }, { scale: '1.16', offset: 0.35 }, { scale: '0.96', offset: 0.7 }, { scale: '1' }], timing)
    table
      .querySelector<HTMLElement | SVGElement>('.plan-ripple')
      ?.animate([{ opacity: 0.95, scale: '1' }, { opacity: 0, scale: '2' }], { duration: PICK_EFFECT_MS, easing: 'ease-out' })
  }
  if (chip && typeof chip.animate === 'function') {
    const ring = getComputedStyle(chip).getPropertyValue('--seat-ring').trim() || '#c9a14a'
    chip.animate(
      [
        { scale: '1', boxShadow: `0 0 0 0 ${ring}` },
        { scale: '1.06', boxShadow: `0 0 0 6px color-mix(in srgb, ${ring} 55%, transparent)`, offset: 0.35 },
        { scale: '1', boxShadow: '0 0 0 12px transparent' },
      ],
      timing,
    )
  }
}

/**
 * Lediga bord andas i takt: alla CSS-animationer `plan-breathe*` i planen
 * får samma starttid, även bord som just blev lediga igen.
 */
export function syncBreathing(root: Element | null | undefined): void {
  if (!root || typeof root.getAnimations !== 'function') return
  for (const a of root.getAnimations({ subtree: true })) {
    if ((a as CSSAnimation).animationName?.startsWith('plan-breathe') && a.startTime !== 0) a.startTime = 0
  }
}
