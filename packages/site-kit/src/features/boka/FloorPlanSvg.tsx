import { labelTables, layoutViewBox } from '../../shared/layoutApi'
import type { FloorGroup, LayoutElement, LayoutTableElement } from '../../shared/layoutApi'
import type { TableUnavailable } from './bookingApi'
import { tableChoice } from './tableState'
import { CHAIR_D, CHAIR_W, chairs } from './chairs'

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
  ghosts = [],
  free,
  selected,
  onToggle,
  unavailable,
  onExplain,
}: {
  group: FloorGroup
  /** Restaurangens andra våningar: ritas svagt under den valda, som om man
   * tittar ner genom huset, så att man ser var man är. */
  ghosts?: FloorGroup[]
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
  const base = layoutViewBox(elements)
  const layers = ghosts.filter((g) => g.elements.length > 0).slice(0, 3)
  const shift = 0.9 // meter per våning bakåt
  const pad = 0.75 // plats för stolarna
  const extra = layers.length * shift
  const box = {
    minX: base.minX - pad,
    minZ: base.minZ - pad - extra,
    width: base.width + pad * 2 + extra,
    height: base.height + pad * 2 + extra,
  }
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
    const { selectable, explainable, interactive, isSelected, state, badge, title } = tableChoice({
      tableId: el.elementId, label, seats: el.seats, free, selected, unavailable,
      canToggle: Boolean(onToggle), canExplain: Boolean(onExplain),
    })
    const act = () => (selectable ? onToggle?.(el.elementId) : onExplain?.(el.elementId))
    const transform = el.rotationY ? `rotate(${el.rotationY} ${el.x} ${el.z})` : undefined
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
    const seatsAround = chairs(el)
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
        {/* Stolarna är bara bild: inskjutna under bordet, ryggstödet utåt, inte klickbara. */}
        <g className={`floor-svg-chairs${state}`} transform={el.shape === 'round' ? undefined : transform} aria-hidden="true">
          {seatsAround.map((c, i) => (
            <g key={i} transform={`rotate(${c.rot} ${c.x} ${c.z})`}>
              <rect className="floor-svg-chair" x={c.x - CHAIR_W / 2} y={c.z - CHAIR_D / 2} width={CHAIR_W} height={CHAIR_D} rx={0.07} />
              <rect className="floor-svg-chair-back" x={c.x - CHAIR_W / 2} y={c.z - CHAIR_D / 2} width={CHAIR_W} height={0.09} rx={0.04} />
            </g>
          ))}
        </g>
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
          {layers.map((g, i) => {
            const depth = layers.length - i
            const gb = layoutViewBox(g.elements)
            const dx = base.minX - gb.minX + depth * shift
            const dz = base.minZ - gb.minZ - depth * shift
            return (
              <g key={g.floor?.floorId ?? i} className="floor-ghost" aria-hidden="true"
                style={{ opacity: Math.max(0.12, 0.32 - (depth - 1) * 0.08) }} transform={`translate(${dx} ${dz})`}>
                {g.elements.filter((el) => el.type === 'wall').map((el) => rect(el, 'floor-ghost-wall'))}
                {g.elements.filter((el): el is LayoutTableElement => el.type === 'table').map((el) =>
                  el.shape === 'round' ? (
                    <circle key={el.elementId} className="floor-ghost-table" cx={el.x} cy={el.z} r={Math.max(el.width, el.depth) / 2} />
                  ) : (
                    rect(el, 'floor-ghost-table')
                  ),
                )}
                {g.floor && (
                  <text className="floor-ghost-label" x={gb.minX + gb.width} y={gb.minZ - 0.15} textAnchor="end">{g.floor.name}</text>
                )}
              </g>
            )
          })}
          {layers.length > 0 && (
            <rect className="floor-focus-plane" x={base.minX - pad * 0.6} y={base.minZ - pad * 0.6}
              width={base.width + pad * 1.2} height={base.height + pad * 1.2} rx={0.25} aria-hidden="true" />
          )}
          {elements.filter((el) => el.type === 'wall').map((el) => rect(el, 'floor-svg-wall'))}
          {elements.filter((el) => el.type === 'door').map((el) => rect(el, 'floor-svg-door'))}
          {elements.filter((el) => el.type === 'window').map((el) => rect(el, 'floor-svg-window'))}
          {tables.map(table)}
        </svg>
      </div>
    </div>
  )
}
