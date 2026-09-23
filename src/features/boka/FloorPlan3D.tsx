import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { labelTables, layoutViewBox } from '../../shared/layoutApi'
import type { FloorGroup, LayoutElement, LayoutTableElement } from '../../shared/layoutApi'

/**
 * 3D-vy av planritningen (Figma-förlaga: admin-front-ends layout-editor,
 * samma "utfälld låda"-teknik i CSS — väggar och bord byggs av roterade
 * sidoytor + ett tak i en scen med perspective + rotateX(tilt)
 * rotateZ(spin)). Skrivskyddad kopia: ingen redigering, bara dra i scenen
 * för att rotera vyn (samma 0.4×deltaX-känsla som admins handverktyg) —
 * ingen zoom, varken via mus-hjul eller knappar, bara rotation.
 *
 * Skalan är stiliserad, inte fysiskt korrekt: väggarnas/bordens HÖJD är en
 * fast pixelkonstant (som i admin) eftersom API:t inte behöver returnera en
 * höjd som ser bra ut i en 3D-scen — bara golvplanets x/z är skalenligt.
 *
 * OBS: Kassan och skillnaden entré/kök syns aldrig här — inte en bugg i den
 * här komponenten, utan att `GET /locations/{id}/layout/active` (och
 * admin-front-ends `LayoutElement`-modell i botten) aldrig lagrar dem alls.
 * Kassan finns bara lokalt i adminens webbläsare (localStorage), och en
 * dörr sparas bara som generisk "door" utan kök/entré-flagga. Se
 * backend-tasken om att lägga till en fixture-typ och ett kind-fält på
 * dörren — tills dess finns det inget för den här sidan att rita.
 */

const SCALE = 42
const WALL_HEIGHT_PX = 90
const TABLE_HEIGHT_PX = 26
const TILT_DEG = 55
/** Marginal runt innehållet (i pixlar, samma skala som SCALE) vid auto-fit. */
const FIT_PADDING = 60

/** Vågrät om rotationen ligger närmare 0° än 90° (modulo 180°) — samma regel som admin. */
function isHorizontal(rotationY: number): boolean {
  const a = ((rotationY % 180) + 180) % 180
  return a < 45 || a >= 135
}

export function FloorPlan3D({ group }: { group: FloorGroup }) {
  const { elements } = group
  const tables = elements.filter((el): el is LayoutTableElement => el.type === 'table')
  const labels = labelTables(tables)
  const box = layoutViewBox(elements)
  const originX = box.minX + box.width / 2
  const originZ = box.minZ + box.height / 2

  const [spin, setSpin] = useState(35)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startX: number; startSpin: number } | null>(null)

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
    drag.current = { startX: e.clientX, startSpin: spin }
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setSpin(drag.current.startSpin + (e.clientX - drag.current.startX) * 0.4)
  }
  function onPointerUp() {
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
        role="img"
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
                return (
                  <div
                    key={el.elementId}
                    className="f3d-wall"
                    style={{ left, top, width, height, ['--wh' as string]: `${WALL_HEIGHT_PX}px` }}
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
                return (
                  <div
                    key={el.elementId}
                    className={`f3d-wall f3d-opening ${isWindow ? 'f3d-window' : 'f3d-door'}`}
                    style={{ left, top, width, height, ['--wh' as string]: `${WALL_HEIGHT_PX}px` }}
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
              return (
                <div
                  key={t.elementId}
                  className={`f3d-table f3d-table--${t.shape}`}
                  style={{
                    left: (t.x - originX) * SCALE - w / 2,
                    top: (t.z - originZ) * SCALE - h / 2,
                    width: w,
                    height: h,
                    ['--th' as string]: `${TABLE_HEIGHT_PX}px`,
                  }}
                  title={`Bord ${label}, ${t.seats} platser`}
                >
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
                        <span className="f3d-table-seats">{t.seats} pl</span>
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
          Dra för att rotera vyn
        </p>
      </div>
    </div>
  )
}
