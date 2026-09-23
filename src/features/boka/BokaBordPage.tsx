import { useEffect, useState } from 'react'
import { isApiConfigured } from '../../shared/api'
import { isLocationConfigured, LOCATION_ID } from '../../shared/config'
import { useLocationInfo } from '../../shared/useLocationInfo'
import {
  getPublicActiveLayout,
  groupElementsByFloor,
  labelTables,
  layoutViewBox,
} from '../../shared/layoutApi'
import type { FloorGroup, LayoutElement, LayoutTableElement } from '../../shared/layoutApi'
import { FloorPlan3D } from './FloorPlan3D'

/**
 * Renderar väggar, dörrar, fönster och bord i verklig skala (SVG-viewBox i
 * meter, samma enhet som API:t) i stället för att bara plotta bordens
 * mittpunkt på en tom svart panel - annars ser det ut som lösryckta
 * prickar utan rum runt sig.
 */
function FloorPlanSvg({ group }: { group: FloorGroup }) {
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

  function renderElement(el: LayoutElement) {
    const transform = el.rotationY ? `rotate(${el.rotationY} ${el.x} ${el.z})` : undefined
    switch (el.type) {
      case 'wall':
        return (
          <rect
            key={el.elementId}
            className="floor-svg-wall"
            x={el.x - el.width / 2}
            y={el.z - el.depth / 2}
            width={el.width}
            height={el.depth}
            transform={transform}
          />
        )
      case 'door':
        return (
          <rect
            key={el.elementId}
            className="floor-svg-door"
            x={el.x - el.width / 2}
            y={el.z - el.depth / 2}
            width={el.width}
            height={el.depth}
            transform={transform}
          />
        )
      case 'window':
        return (
          <rect
            key={el.elementId}
            className="floor-svg-window"
            x={el.x - el.width / 2}
            y={el.z - el.depth / 2}
            width={el.width}
            height={el.depth}
            transform={transform}
          />
        )
      case 'table': {
        const label = labels.get(el.elementId) ?? '?'
        const shape =
          el.shape === 'round' ? (
            <circle
              className="floor-svg-table"
              cx={el.x}
              cy={el.z}
              r={Math.max(el.width, el.depth) / 2}
            />
          ) : (
            <rect
              className="floor-svg-table"
              x={el.x - el.width / 2}
              y={el.z - el.depth / 2}
              width={el.width}
              height={el.depth}
              rx={Math.min(el.width, el.depth) * 0.15}
              transform={transform}
            />
          )
        return (
          <g key={el.elementId}>
            <title>{`Bord ${label}, ${el.seats} platser`}</title>
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
      default:
        return null
    }
  }

  return (
    <div className="floor-wrap">
      <div className="floor-svg-frame" style={{ aspectRatio: aspectRatio || undefined }}>
        <svg
          className="floor-svg"
          viewBox={`${box.minX} ${box.minZ} ${box.width} ${box.height}`}
          role="img"
          aria-label={`Planritning${group.floor ? `, ${group.floor.name}` : ''}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {elements.filter((el) => el.type === 'wall').map(renderElement)}
          {elements.filter((el) => el.type === 'door' || el.type === 'window').map(renderElement)}
          {tables.map(renderElement)}
        </svg>
      </div>
    </div>
  )
}

/**
 * Boka bord - TILLS VIDARE enbart en förhandsvisning av den riktiga
 * planritningen (GET /locations/{id}/layout/active). Ingen datum-/tidsval,
 * inget bordsval, ingen bekräftelse: det finns ännu ingen godkänd
 * reservations-integration i backend (se ../../../../back_end_application),
 * så sidan ska inte låtsas kunna ta emot en bokning. Den fulla
 * bokningsflödet (tillgänglighet, kontaktuppgifter, bekräftelse) byggs på
 * nytt mot den riktiga /reservations-rutten när den är godkänd.
 */
export default function BokaBordPage() {
  const apiReady = isApiConfigured() && isLocationConfigured()
  const location = useLocationInfo()
  const [floors, setFloors] = useState<FloorGroup[] | null>(null)
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(apiReady)

  useEffect(() => {
    if (!apiReady || !LOCATION_ID) return
    let cancelled = false
    getPublicActiveLayout(LOCATION_ID)
      .then((layout) => {
        if (cancelled) return
        const groups = groupElementsByFloor(layout)
        setFloors(groups)
        setActiveFloorId(groups[0]?.floor?.floorId ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Planritningen kunde inte hämtas.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiReady])

  const activeGroup =
    floors?.find((g) => g.floor?.floorId === activeFloorId) ?? floors?.[0] ?? null

  return (
    <>
      <section className="page-hero">
        <p className="hero-kicker">Vårt matsal</p>
        <h1>Boka Bord</h1>
        <p className="hero-sub">
          Här är vår planritning. Onlinebokning öppnar snart - ring oss på{' '}
          {location.phone} så bokar vi ditt bord direkt.
        </p>
      </section>

      {!apiReady && (
        <p className="notice error" role="alert">
          Planritningen är inte tillgänglig just nu - kontakta oss gärna direkt.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading && !error && (
        <p className="notice" role="status">
          Hämtar planritningen…
        </p>
      )}

      {floors && floors.length > 1 && (
        <div className="filter-row" role="group" aria-label="Välj våning">
          {floors.map((g) => (
            <button
              key={g.floor?.floorId ?? 'flat'}
              type="button"
              className={`filter-pill${activeGroup?.floor?.floorId === g.floor?.floorId ? ' active' : ''}`}
              aria-pressed={activeGroup?.floor?.floorId === g.floor?.floorId}
              onClick={() => setActiveFloorId(g.floor?.floorId ?? null)}
            >
              {g.floor?.name ?? 'Planritning'}
            </button>
          ))}
        </div>
      )}

      {activeGroup && (
        <>
          <div className="floor-view-toggle" role="group" aria-label="2D eller 3D">
            <button
              type="button"
              className={view === '2d' ? 'active' : ''}
              aria-pressed={view === '2d'}
              onClick={() => setView('2d')}
            >
              2D
            </button>
            <button
              type="button"
              className={view === '3d' ? 'active' : ''}
              aria-pressed={view === '3d'}
              onClick={() => setView('3d')}
            >
              3D
            </button>
          </div>
          {view === '2d' ? (
            <FloorPlanSvg group={activeGroup} />
          ) : (
            <FloorPlan3D group={activeGroup} />
          )}
        </>
      )}

      <section className="dark-band">
        <h2>Vill du boka nu?</h2>
        <p>
          Ring oss på {location.phone} eller besök oss på {location.address}, så
          hjälper vi dig att hitta ett bra bord. Onlinebokning med bekräftelse
          direkt i webbläsaren är på väg.
        </p>
      </section>
    </>
  )
}
