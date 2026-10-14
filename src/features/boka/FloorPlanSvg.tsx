import { labelTables, layoutViewBox } from '../../shared/layoutApi'
import type { FloorGroup, LayoutElement, LayoutTableElement } from '../../shared/layoutApi'
import { tableBadge } from './bookingApi'
import type { TableUnavailable } from './bookingApi'

/** Utseende per anledning: bokat/spärrat är upptaget, resten passar inte sällskapet. */
function stateClass(u: TableUnavailable | undefined): string {
  if (!u) return ' is-taken'
  if (u.reason === 'booked') return ' is-booked'
  if (u.reason === 'blocked') return ' is-blocked'
  return ' is-unfit'
}

/**
 * Planritningen i verklig skala (SVG-viewBox i meter, samma enhet som
 * API:t): väggar, dörrar, fönster och bord.
 *
 * Med `free` blir den ett bordsval: lediga bord (för den valda tiden) går
 * att klicka/tabba till och markera. Övriga bord visar varför de inte går
 * att välja (`unavailable`: bokat, spärrat, fel storlek, bara telefon) -
 * ett tryck på dem anropar `onExplain` så sidan kan förklara. Utan `free`
 * är den en ren förhandsvisning.
 */
export function FloorPlanSvg({
  group,
  free,
  selected,
  onToggle,
  unavailable,
  onExplain,
}: {
  group: FloorGroup
  /** tableId -> platser, för bord som är lediga vid den valda tiden. */
  free?: Map<string, number>
  selected?: ReadonlySet<string>
  onToggle?: (tableId: string) => void
  /** tableId -> varför bordet inte går att välja vid den valda tiden. */
  unavailable?: Map<string, TableUnavailable>
  onExplain?: (tableId: string) => void
}) {
  const { elements } = group
  const tables = elements.filter((el): el is LayoutTableElement => el.type === 'table')
  const box = layoutViewBox(elements)
  const labels = labelTables(tables)
  const aspectRatio = box.width / box.height

  if (elements.length === 0) {
    return (
      <p className="notice" role="status">
        Ingen planritning publicerad för den här våningen ännu.
      </p>
    )
  }

  function rect(el: LayoutElement, className: string) {
    const transform = el.rotationY ? `rotate(${el.rotationY} ${el.x} ${el.z})` : undefined
    return (
      <rect
        key={el.elementId}
        className={className}
        x={el.x - el.width / 2}
        y={el.z - el.depth / 2}
        width={el.width}
        height={el.depth}
        transform={transform}
      />
    )
  }

  function table(el: LayoutTableElement) {
    const label = labels.get(el.elementId) ?? '?'
    const isFree = free ? free.has(el.elementId) : true
    const isSelected = selected?.has(el.elementId) ?? false
    const why = isFree ? undefined : unavailable?.get(el.elementId)
    const selectable = Boolean(free && onToggle && isFree)
    const explainable = Boolean(free && !isFree && onExplain)
    const interactive = selectable || explainable
    const act = () => (selectable ? onToggle?.(el.elementId) : onExplain?.(el.elementId))
    const transform = el.rotationY ? `rotate(${el.rotationY} ${el.x} ${el.z})` : undefined
    const state = !free ? '' : isSelected ? ' is-selected' : isFree ? ' is-free' : stateClass(why)
    const badge = !free || isFree ? `${el.seats} pl` : why ? tableBadge(why) : 'Ej ledigt'
    const shape =
      el.shape === 'round' ? (
        <circle className={`floor-svg-table${state}`} cx={el.x} cy={el.z} r={Math.max(el.width, el.depth) / 2} />
      ) : (
        <rect
          className={`floor-svg-table${state}`}
          x={el.x - el.width / 2}
          y={el.z - el.depth / 2}
          width={el.width}
          height={el.depth}
          rx={Math.min(el.width, el.depth) * 0.15}
          transform={transform}
        />
      )
    const status = !free ? '' : isFree ? (isSelected ? ', valt' : ', ledigt') : `, går inte att välja: ${badge.toLowerCase()}`
    const title = `Bord ${label}, ${el.seats} platser${status}`
    return (
      <g
        key={el.elementId}
        className={selectable ? 'floor-svg-pick' : explainable ? 'floor-svg-explain' : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={selectable ? isSelected : undefined}
        aria-label={interactive ? title : undefined}
        onClick={interactive ? act : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  act()
                }
              }
            : undefined
        }
      >
        <title>{title}</title>
        {shape}
        <text className="floor-svg-table-label" x={el.x} y={el.z - 0.12} textAnchor="middle">
          {label}
        </text>
        <text className="floor-svg-table-seats" x={el.x} y={el.z + 0.22} textAnchor="middle">
          {badge}
        </text>
      </g>
    )
  }

  return (
    <div className="floor-wrap">
      <div className="floor-svg-frame" style={{ aspectRatio: aspectRatio || undefined }}>
        <svg
          className="floor-svg"
          viewBox={`${box.minX} ${box.minZ} ${box.width} ${box.height}`}
          role="group"
          aria-label={`Planritning${group.floor ? `, ${group.floor.name}` : ''}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {elements.filter((el) => el.type === 'wall').map((el) => rect(el, 'floor-svg-wall'))}
          {elements.filter((el) => el.type === 'door').map((el) => rect(el, 'floor-svg-door'))}
          {elements.filter((el) => el.type === 'window').map((el) => rect(el, 'floor-svg-window'))}
          {tables.map(table)}
        </svg>
      </div>
    </div>
  )
}
