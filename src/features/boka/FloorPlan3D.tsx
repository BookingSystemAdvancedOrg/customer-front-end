import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { labelTables, layoutViewBox } from '../../shared/layoutApi'
import type { FloorGroup, LayoutElement, LayoutTableElement } from '../../shared/layoutApi'
import type { TableUnavailable } from './bookingApi'
import { tableChoice } from './tableState'
import { CHAIR_D, CHAIR_W, chairs } from './chairs'

/**
 * 3D-vy av planritningen (Figma-förlaga: admin-front-ends layout-editor,
 * samma "utfälld låda"-teknik i CSS - väggar och bord byggs av roterade
 * sidoytor + ett tak i en scen med perspective + rotateX(tilt)
 * rotateZ(spin)). Skrivskyddad kopia: ingen redigering, bara dra i scenen
 * för att rotera vyn (samma 0.4×deltaX-känsla som admins handverktyg) -
 * ingen zoom, varken via mus-hjul eller knappar, bara rotation.
 *
 * Med `free` är det samma bordsval som 2D-planen (FloorPlanSvg, delad
 * logik i tableState.ts): tryck på ett ledigt bord väljer det, tryck på
 * ett upptaget förklarar varför. Ett tryck räknas bara om pekaren inte
 * flyttats mer än DRAG_THRESHOLD_PX - annars var det en rotation.
 *
 * Skalan är stiliserad, inte fysiskt korrekt: väggarnas/bordens HÖJD är en
 * fast pixelkonstant (som i admin) eftersom API:t inte behöver returnera en
 * höjd som ser bra ut i en 3D-scen - bara golvplanets x/z är skalenligt.
 *
 * OBS: Kassan och skillnaden entré/kök syns aldrig här - inte en bugg i den
 * här komponenten, utan att `GET /locations/{id}/layout/active` (och
 * admin-front-ends `LayoutElement`-modell i botten) aldrig lagrar dem alls.
 * Kassan finns bara lokalt i adminens webbläsare (localStorage), och en
 * dörr sparas bara som generisk "door" utan kök/entré-flagga. Se
 * backend-tasken om att lägga till en fixture-typ och ett kind-fält på
 * dörren - tills dess finns det inget för den här sidan att rita.
 */

const SCALE = 42
const WALL_HEIGHT_PX = 90
/** Sockelhöjd för väggen som vetter mot kameran - samma idé som admins WALL_LOW. */
const WALL_LOW_PX = 16
const TABLE_HEIGHT_PX = 26
const TILT_DEG = 55
/** Marginal runt innehållet (i pixlar, samma skala som SCALE) vid auto-fit. */
const FIT_PADDING = 60
/** Så långt pekaren får röra sig innan ett tryck blir en rotation. */
const DRAG_THRESHOLD_PX = 6

/** Vågrät om rotationen ligger närmare 0° än 90° (modulo 180°) - samma regel som admin. */
function isHorizontal(rotationY: number): boolean {
  const a = ((rotationY % 180) + 180) % 180
  return a < 45 || a >= 135
}

/**
 * Sänker väggen som är vänd mot kameran, så bordet bakom den inte skyms -
 * samma princip som admins `isLowered`. Adminens egen variant testar mot en
 * ritad markyta (vilken sida av väggen är "inne i rummet"); den finns aldrig
 * i den publika layouten (grounds/fixtures lagras bara lokalt i admins
 * webbläsare, se docblocken ovan), så den här varianten använder rummets
 * geometriska mittpunkt (från layoutViewBox) i stället - väggens sida som
 * vetter BORT från mitten är dess utsida, och om den utsidan pekar mot
 * kameran (samma riktning som `viewDir`, som roterar med `spin`) ska den
 * sänkas.
 */
function isFacingCamera(
  el: LayoutElement,
  originX: number,
  originZ: number,
  spinDeg: number,
): boolean {
  const horizontal = isHorizontal(el.rotationY)
  let nx = horizontal ? 0 : 1
  let nz = horizontal ? 1 : 0
  const towardCenterX = originX - el.x
  const towardCenterZ = originZ - el.z
  if (nx * towardCenterX + nz * towardCenterZ > 0) {
    // Kandidatriktningen pekade mot mitten - vänd den så den pekar utåt.
    nx = -nx
    nz = -nz
  }
  const spinRad = (spinDeg * Math.PI) / 180
  const viewX = Math.sin(spinRad)
  const viewZ = Math.cos(spinRad)
  return nx * viewX + nz * viewZ > 0
}

export function FloorPlan3D({
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
  const labels = labelTables(tables)
  const box = layoutViewBox(elements)
  const originX = box.minX + box.width / 2
  const originZ = box.minZ + box.height / 2

  const [spin, setSpin] = useState(35)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startX: number; startSpin: number; pointerId: number; moved: boolean } | null>(null)
  // Satt när senaste gesten var en rotation: klicket som följer ska inte välja bord.
  const justRotated = useRef(false)

  const sceneRef = useRef<HTMLDivElement | null>(null)
  const [sceneSize, setSceneSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const node = sceneRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSceneSize({ w: width, h: height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Auto-fit: skalar scenen så hela golvplanet ryms i den tillgängliga ytan,
  // oavsett skärmstorlek - samma idé som adminens layout-editor. Använder
  // rummets diagonal (bredd+djup, inte var för sig) som mått eftersom
  // användaren kan rotera fritt (spin) - ett mått som bara tar hänsyn till
  // bredden hade klippt rummet vid t.ex. 90°, då djupet blir det som syns
  // brett i bild. Diagonalen är stabil oavsett rotationsvinkel.
  const tiltRad = (TILT_DEG * Math.PI) / 180
  const diag = (box.width + box.height) * 0.707 * SCALE + FIT_PADDING * 2
  const projectedDepth = diag * Math.cos(tiltRad) + WALL_HEIGHT_PX + FIT_PADDING
  const fit =
    sceneSize.w > 0 && sceneSize.h > 0
      ? Math.min(sceneSize.w / diag, sceneSize.h / projectedDepth, 1.4)
      : 1

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // Ingen pointer capture här: den skulle flytta klicket från bordet till
    // scenen. Den tas först när gesten visat sig vara en rotation.
    drag.current = { startX: e.clientX, startSpin: spin, pointerId: e.pointerId, moved: false }
    justRotated.current = false
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    if (!drag.current.moved) {
      if (Math.abs(e.clientX - drag.current.startX) < DRAG_THRESHOLD_PX) return
      drag.current.moved = true
      setDragging(true)
      e.currentTarget.setPointerCapture?.(drag.current.pointerId)
    }
    // Minus: rotateZ(+) vrider medurs, så golvets närmaste kant flyttade
    // sig åt motsatt håll mot dragningen. Nu följer den fingret/musen.
    setSpin(drag.current.startSpin - (e.clientX - drag.current.startX) * 0.4)
  }
  function onPointerUp() {
    justRotated.current = Boolean(drag.current?.moved)
    drag.current = null
    setDragging(false)
  }

  if (elements.length === 0) {
    return (
      <p className="notice" role="status">
        Ingen planritning publicerad för den här våningen ännu.
      </p>
    )
  }

  function wallBox(el: LayoutElement) {
    const horizontal = isHorizontal(el.rotationY)
    const w = (horizontal ? el.width : el.depth) * SCALE
    const h = (horizontal ? el.depth : el.width) * SCALE
    return {
      left: (el.x - originX) * SCALE - w / 2,
      top: (el.z - originZ) * SCALE - h / 2,
      width: Math.max(w, 2),
      height: Math.max(h, 2),
      horizontal,
    }
  }

  return (
    <div className="floor-wrap">
      <div
        ref={sceneRef}
        className={`f3d-scene${dragging ? ' f3d-scene--dragging' : ''}`}
        // role="img" gör barnen osynliga för skärmläsare - med bordsval är
        // borden knappar, så då är scenen en grupp.
        role={free ? 'group' : 'img'}
        aria-label={`3D-planritning${group.floor ? `, ${group.floor.name}` : ''}. Dra för att rotera.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={`f3d-world${dragging ? ' f3d-world--dragging' : ''}`}
          style={{
            ['--tilt' as string]: `${TILT_DEG}deg`,
            ['--spin' as string]: `${spin}deg`,
            ['--zoom' as string]: fit,
          }}
        >
          <div className="f3d-plane">
            {elements
              .filter((el) => el.type === 'wall')
              .map((el) => {
                const { left, top, width, height, horizontal } = wallBox(el)
                const wh = isFacingCamera(el, originX, originZ, spin) ? WALL_LOW_PX : WALL_HEIGHT_PX
                return (
                  <div
                    key={el.elementId}
                    className="f3d-wall"
                    style={{ left, top, width, height, ['--wh' as string]: `${wh}px` }}
                  >
                    <div className={`f3d-face ${horizontal ? 'h-n' : 'v-w'}`} />
                    <div className={`f3d-face ${horizontal ? 'h-s' : 'v-e'}`} />
                    <div className="f3d-cap" />
                  </div>
                )
              })}

            {elements
              .filter((el) => el.type === 'door' || el.type === 'window')
              .map((el) => {
                const { left, top, width, height, horizontal } = wallBox(el)
                const isWindow = el.type === 'window'
                const wh = isFacingCamera(el, originX, originZ, spin) ? WALL_LOW_PX : WALL_HEIGHT_PX
                return (
                  <div
                    key={el.elementId}
                    className={`f3d-wall f3d-opening ${isWindow ? 'f3d-window' : 'f3d-door'}`}
                    style={{ left, top, width, height, ['--wh' as string]: `${wh}px` }}
                  >
                    <div className={`f3d-face ${horizontal ? 'h-n' : 'v-w'}`} />
                    <div className={`f3d-face ${horizontal ? 'h-s' : 'v-e'}`} />
                    {isWindow && <div className="f3d-cap" />}
                  </div>
                )
              })}

            {tables.map((t) => {
              const w = t.width * SCALE
              const h = t.depth * SCALE
              const label = labels.get(t.elementId) ?? '?'
              const c = tableChoice({
                tableId: t.elementId, label, seats: t.seats, free, selected, unavailable,
                canToggle: Boolean(onToggle), canExplain: Boolean(onExplain),
              })
              const act = () => {
                if (justRotated.current) return
                if (c.selectable) onToggle?.(t.elementId)
                else onExplain?.(t.elementId)
              }
              return (
                <div
                  key={t.elementId}
                  className={`f3d-table f3d-table--${t.shape}${c.state}${c.selectable ? ' f3d-pick' : c.explainable ? ' f3d-explain' : ''}`}
                  role={c.interactive ? 'button' : undefined}
                  tabIndex={c.interactive ? 0 : undefined}
                  aria-pressed={c.selectable ? c.isSelected : undefined}
                  aria-label={c.interactive ? c.title : undefined}
                  onClick={c.interactive ? act : undefined}
                  onKeyDown={
                    c.interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            act()
                          }
                        }
                      : undefined
                  }
                  style={{
                    left: (t.x - originX) * SCALE - w / 2,
                    top: (t.z - originZ) * SCALE - h / 2,
                    width: w,
                    height: h,
                    ['--th' as string]: `${TABLE_HEIGHT_PX}px`,
                  }}
                  title={c.title}
                >
                  {/* Stolarna: inskjutna under bordet, ryggstödet utåt, bara bild (inte klickbara). */}
                  {chairs(t).map((ch, i) => (
                    <div
                      key={i}
                      className="f3d-chair"
                      aria-hidden="true"
                      style={{
                        left: (ch.x - t.x) * SCALE + w / 2 - (CHAIR_W * SCALE) / 2,
                        top: (ch.z - t.z) * SCALE + h / 2 - (CHAIR_D * SCALE) / 2,
                        width: CHAIR_W * SCALE,
                        height: CHAIR_D * SCALE,
                        transform: `rotate(${ch.rot}deg)`,
                      }}
                    >
                      <div className="f3d-chair-seat" />
                      <div className="f3d-chair-back" />
                    </div>
                  ))}
                  <div className="f3d-table-body">
                    {t.shape === 'rect' ? (
                      <>
                        <div className="f3d-table-face back" />
                        <div className="f3d-table-face left" />
                        <div className="f3d-table-face right" />
                        <div className="f3d-table-face front" />
                      </>
                    ) : (
                      <div className="f3d-table-face ring" />
                    )}
                    <div className="f3d-table-top">
                      <span className="f3d-table-label-wrap">
                        <span className="f3d-table-label">{label}</span>
                        <span className="f3d-table-seats">{c.badge}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <p className="f3d-hint">
          <span className="f3d-hint-icon" aria-hidden="true">
            ✋
          </span>
          {free ? 'Dra för att rotera, tryck på ett bord för att välja' : 'Dra för att rotera vyn'}
        </p>
      </div>
    </div>
  )
}
