import type { LayoutTableElement } from '../../shared/layoutApi'

/** En stol i meter: bredd längs bordskanten, djup ut från bordet. */
export const CHAIR_W = 0.42
export const CHAIR_D = 0.36
/** Så långt stolen är inskjuten under bordsskivan. */
const TUCK = 0.16

export interface Chair {
  /** Stolens mittpunkt i planritningens koordinater (meter). */
  x: number
  z: number
  /** Vridning i grader: 0 = ryggstödet uppåt (mot -z), sedan medurs. */
  rot: number
}

/**
 * En stol per plats, inskjuten under bordet: längs långsidorna på ett
 * rektangulärt bord (och kortsidorna när det behövs), jämnt runt ett runt.
 * Ryggstödet vänder alltid bort från bordet. Samma stolar i 2D och 3D.
 */
export function chairs(el: LayoutTableElement): Chair[] {
  const n = Math.max(0, Math.min(el.seats || 0, 16))
  if (n === 0) return []
  const out = CHAIR_D / 2 - TUCK
  if (el.shape === 'round') {
    const r = Math.max(el.width, el.depth) / 2 + out
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      return { x: el.x + Math.cos(a) * r, z: el.z + Math.sin(a) * r, rot: (a * 180) / Math.PI + 90 }
    })
  }
  const long = el.width >= el.depth
  const along = long ? el.width : el.depth
  const across = long ? el.depth : el.width
  const perSide = Math.ceil(n / 2)
  // Får inte stolarna plats på långsidorna sätts en på varje kortsida.
  const ends = perSide * (CHAIR_W + 0.08) > along && n >= 4 ? 2 : 0
  const sides = n - ends
  const top = Math.ceil(sides / 2)
  const bottom = sides - top
  const list: Chair[] = []
  const place = (count: number, sign: number) => {
    for (let i = 0; i < count; i++) {
      const u = ((i + 0.5) / count - 0.5) * along
      const v = sign * (across / 2 + out)
      list.push(long ? { x: el.x + u, z: el.z + v, rot: sign > 0 ? 180 : 0 } : { x: el.x + v, z: el.z + u, rot: sign > 0 ? 90 : 270 })
    }
  }
  place(top, -1)
  place(bottom, 1)
  for (let i = 0; i < ends; i++) {
    const sign = i === 0 ? -1 : 1
    const u = sign * (along / 2 + out)
    list.push(long ? { x: el.x + u, z: el.z, rot: sign > 0 ? 90 : 270 } : { x: el.x, z: el.z + u, rot: sign > 0 ? 180 : 0 })
  }
  return list
}
