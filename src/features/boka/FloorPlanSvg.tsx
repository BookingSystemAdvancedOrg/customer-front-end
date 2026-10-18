import { labelTables, layoutViewBox } from '../../shared/layoutApi'
import type { FloorGroup, LayoutElement, LayoutTableElement } from '../../shared/layoutApi'
import { tableBadge } from './bookingApi'
import type { TableUnavailable } from './bookingApi'

/** Stolar runt ett bord, sett ovanifrån: längs långsidorna på ett
 * rektangulärt bord (och kortsidorna när det behövs), jämnt runt ett runt. */
function chairs(el: LayoutTableElement): { x: number; z: number; rot: number }[] {
  const n = Math.max(0, Math.min(el.seats || 0, 16))
  const gap = 0.24
  if (n === 0) return []
  if (el.shape === 'round') {
    const r = Math.max(el.width, el.depth) / 2 + gap
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
  const ends = perSide * 0.5 > along && n >= 4 ? 2 : 0
  const sides = n - ends
  const top = Math.ceil(sides / 2)
  const bottom = sides - top
  const out: { x: number; z: number; rot: number }[] = []
  const place = (count: number, sign: number) => {
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5
      const u = t * along
      const v = sign * (across / 2 + gap)
      out.push(long ? { x: el.x + u, z: el.z + v, rot: sign > 0 ? 180 : 0 } : { x: el.x + v, z: el.z + u, rot: sign > 0 ? 90 : 270 })
    }
  }
  place(top, -1)
  place(bottom, 1)
  for (let i = 0; i < ends; i++) {
    const sign = i === 0 ? -1 : 1
    const u = sign * (along / 2 + gap)
    out.push(long ? { x: el.x + u, z: el.z, rot: sign > 0 ? 90 : 270 } : { x: el.x, z: el.z + u, rot: sign > 0 ? 180 : 0 })
  }
  return out
}

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
        <g className={`floor-svg-chairs${state}`} transform={el.shape === 'round' ? undefined : transform}>
          {seatsAround.map((c, i) => (
            <rect key={i} className="floor-svg-chair" x={c.x - 0.19} y={c.z - 0.15} width={0.38} height={0.3} rx={0.09}
              transform={`rotate(${c.rot} ${c.x} ${c.z})`} />
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
