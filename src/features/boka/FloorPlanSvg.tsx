import { labelTables, layoutViewBox } from '../../shared/layoutApi'
import type { FloorGroup, LayoutElement, LayoutTableElement } from '../../shared/layoutApi'

/**
 * Planritningen i verklig skala (SVG-viewBox i meter, samma enhet som
 * API:t): väggar, dörrar, fönster och bord.
 *
 * Med `free` blir den ett bordsval: lediga bord (för den valda tiden) går
 * att klicka/tabba till och markera, upptagna bord är nedtonade. Utan
 * `free` är den en ren förhandsvisning.
 */
export function FloorPlanSvg({
  group,
  free,
  selected,
  onToggle,
}: {
  group: FloorGroup
  /** tableId -> platser, för bord som är lediga vid den valda tiden. */
  free?: Map<string, number>
  selected?: ReadonlySet<string>
  onToggle?: (tableId: string) => void
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
    const selectable = Boolean(free && onToggle && isFree)
    const transform = el.rotationY ? `rotate(${el.rotationY} ${el.x} ${el.z})` : undefined
    const state = !free ? '' : isSelected ? ' is-selected' : isFree ? ' is-free' : ' is-taken'
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
    const title = `Bord ${label}, ${el.seats} platser${free ? (isFree ? (isSelected ? ', valt' : ', ledigt') : ', upptaget') : ''}`
    return (
      <g
        key={el.elementId}
        className={selectable ? 'floor-svg-pick' : undefined}
        role={selectable ? 'button' : undefined}
        tabIndex={selectable ? 0 : undefined}
        aria-pressed={selectable ? isSelected : undefined}
        aria-label={selectable ? title : undefined}
        onClick={selectable ? () => onToggle?.(el.elementId) : undefined}
        onKeyDown={
          selectable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle?.(el.elementId)
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
          {el.seats} pl
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
