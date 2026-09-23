import { apiGet, ApiError } from './api'

/**
 * Klient mot backendens PUBLIKA planritnings-endpoint (openapi.yaml,
 * Layout-taggen):
 *
 *   GET /locations/{id}/layout/active - den gällande publicerade
 *   layoutens våningar och renderbara element (väggar/dörrar/fönster/bord),
 *   ingen inloggning krävs (`security: []`). Versionshistorik och
 *   auditfält finns aldrig med.
 *
 * Ett bords `elementId` här är samma identifierare som `tableId` i
 * GET /locations/{id}/availability ("Active published-layout table
 * identifier") - den framtida bokningsintegrationen kan slå ihop ledighet
 * med bordets riktiga position i rummet via det fältet.
 */

export interface LayoutFloor {
  floorId: string
  name: string
  level: number
}

interface LayoutElementBase {
  elementId: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  rotationY: number
  /** Saknas på en äldre, platt (icke-våningsindelad) layout. */
  floorId?: string
}

export interface LayoutWallElement extends LayoutElementBase {
  type: 'wall'
}

export interface LayoutDoorElement extends LayoutElementBase {
  type: 'door'
  wallId: string
}

export interface LayoutWindowElement extends LayoutElementBase {
  type: 'window'
  wallId: string
}

export interface LayoutTableElement extends LayoutElementBase {
  type: 'table'
  shape: 'rect' | 'round'
  seats: number
  zone: string
}

export type LayoutElement =
  | LayoutWallElement
  | LayoutDoorElement
  | LayoutWindowElement
  | LayoutTableElement

export interface PublicActiveLayout {
  floors: LayoutFloor[]
  elements: LayoutElement[]
}

function toFriendlyLayoutError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new Error('Planritningen tog för lång tid att hämta.')
  }
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err : new Error('Ett okänt fel inträffade.')
  }

  console.error(`[Layout] ${err.status}: ${err.message}`)

  switch (err.status) {
    case 404:
      return new ApiError(404, 'Ingen publicerad planritning hittades.')
    case 503:
      return new ApiError(
        503,
        'Planritningen är tillfälligt otillgänglig. Försök igen.',
      )
    default:
      return new ApiError(err.status, 'Planritningen kunde inte hämtas just nu.')
  }
}

/** Den gällande publika planritningen för en plats. */
export async function getPublicActiveLayout(
  locationId: string,
): Promise<PublicActiveLayout> {
  try {
    return await apiGet<PublicActiveLayout>(
      `/locations/${encodeURIComponent(locationId)}/layout/active`,
    )
  } catch (err) {
    throw toFriendlyLayoutError(err)
  }
}

export interface LayoutViewBox {
  minX: number
  minZ: number
  width: number
  height: number
}

/**
 * SVG-viewBox som täcker alla element (väggar, dörrar, fönster, bord) med
 * marginal, så att en roterad rektangels verkliga hörn aldrig klipps av.
 *
 * Marginalen per axel är den roterade rektangelns axel-parallella
 * halv-utsträckning (`|halvbredd·cosθ| + |halvdjup·sinθ|` för x, med sin/cos
 * bytta för z) - INTE en enda halv-diagonal applicerad på båda axlarna. En
 * lång tunn vägg (t.ex. 16 m × 0.2 m) har en halv-diagonal på ~8 m; att
 * använda den som marginal på BÅDA axlarna blåser upp den korta axeln
 * (väggens tjocklek) lika mycket som den långa (väggens längd) och gör hela
 * viewBoxen nästan kvadratisk i stället för att följa rummets verkliga
 * proportioner - bara de element som råkar ligga nära origo syns då inom en
 * rimlig zoom. Ett tomt snapshot ger en 1×1-box så anroparen slipper dela
 * med noll.
 */
export function layoutViewBox(elements: LayoutElement[]): LayoutViewBox {
  if (elements.length === 0) return { minX: 0, minZ: 0, width: 1, height: 1 }

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const el of elements) {
    const radians = (el.rotationY * Math.PI) / 180
    const halfWidth = el.width / 2
    const halfDepth = el.depth / 2
    const halfExtentX = Math.abs(halfWidth * Math.cos(radians)) + Math.abs(halfDepth * Math.sin(radians))
    const halfExtentZ = Math.abs(halfWidth * Math.sin(radians)) + Math.abs(halfDepth * Math.cos(radians))
    minX = Math.min(minX, el.x - halfExtentX)
    maxX = Math.max(maxX, el.x + halfExtentX)
    minZ = Math.min(minZ, el.z - halfExtentZ)
    maxZ = Math.max(maxZ, el.z + halfExtentZ)
  }
  return { minX, minZ, width: maxX - minX || 1, height: maxZ - minZ || 1 }
}

export interface FloorGroup {
  /** `null` för en äldre, platt layout utan våningsindelning. */
  floor: LayoutFloor | null
  elements: LayoutElement[]
}

/**
 * Delar upp elementen per våning, i `floors`-listans ordning (stigande
 * `level`). Behövs för Boka bord-förhandsvisningen: att slå ihop alla
 * våningars koordinater i EN bounding box (som `layoutTablePositions` gör
 * på ett enda anrop) skulle klämma ihop bord från olika våningar i samma
 * panel. Ett legacy-snapshot utan `floorId` ger en enda grupp.
 */
export function groupElementsByFloor(layout: PublicActiveLayout): FloorGroup[] {
  if (layout.floors.length === 0) {
    return [{ floor: null, elements: layout.elements }]
  }
  return [...layout.floors]
    .sort((a, b) => a.level - b.level)
    .map((floor) => ({
      floor,
      elements: layout.elements.filter((el) => el.floorId === floor.floorId),
    }))
}
