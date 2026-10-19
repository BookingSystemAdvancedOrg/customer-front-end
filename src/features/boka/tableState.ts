import { tableBadge } from './bookingApi'
import type { TableUnavailable } from './bookingApi'

/** Det 2D- och 3D-planen behöver om ett bord i bordsvalet. */
export interface TableChoice {
  /** Ledigt vid den valda tiden och går att välja. */
  selectable: boolean
  /** Inte ledigt, men ett tryck förklarar varför. */
  explainable: boolean
  interactive: boolean
  isSelected: boolean
  /** ' is-free', ' is-selected', ' is-booked', ... ('' utan bordsval). */
  state: string
  /** Texten under bordsnumret: "4 pl" eller varför det inte går. */
  badge: string
  /** Hela beskrivningen för skärmläsare och tooltip. */
  title: string
}

/** Utseende per anledning: bokat/spärrat är upptaget, resten passar inte sällskapet. */
function stateClass(u: TableUnavailable | undefined): string {
  if (!u) return ' is-taken'
  if (u.reason === 'booked') return ' is-booked'
  if (u.reason === 'blocked') return ' is-blocked'
  return ' is-unfit'
}

/**
 * Utan `free` är planen en ren förhandsvisning (inga klick, inga färger).
 * Med `free` går lediga bord att välja och övriga förklaras vid tryck.
 */
export function tableChoice(opts: {
  tableId: string
  label: string
  seats: number
  free?: Map<string, number>
  selected?: ReadonlySet<string>
  unavailable?: Map<string, TableUnavailable>
  canToggle: boolean
  canExplain: boolean
}): TableChoice {
  const { tableId, label, seats, free, selected, unavailable } = opts
  const isFree = free ? free.has(tableId) : true
  const isSelected = selected?.has(tableId) ?? false
  const why = isFree ? undefined : unavailable?.get(tableId)
  const selectable = Boolean(free && opts.canToggle && isFree)
  const explainable = Boolean(free && !isFree && opts.canExplain)
  const state = !free ? '' : isSelected ? ' is-selected' : isFree ? ' is-free' : stateClass(why)
  const badge = !free || isFree ? `${seats} pl` : why ? tableBadge(why) : 'Ej ledigt'
  const status = !free ? '' : isFree ? (isSelected ? ', valt' : ', ledigt') : `, går inte att välja: ${badge.toLowerCase()}`
  return {
    selectable,
    explainable,
    interactive: selectable || explainable,
    isSelected,
    state,
    badge,
    title: `Bord ${label}, ${seats} platser${status}`,
  }
}
