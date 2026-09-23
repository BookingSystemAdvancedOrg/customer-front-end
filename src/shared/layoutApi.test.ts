import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LayoutElement, PublicActiveLayout } from './layoutApi'

/** Miljöberoende värden läses vid modul-laddning - importera om per test. */
async function loadLayoutApi(env: Record<string, string> = {}) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', env.VITE_API_BASE_URL ?? '')
  return import('./layoutApi')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('getPublicActiveLayout', () => {
  it('hämtar den publika planritningen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ floors: [], elements: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { getPublicActiveLayout } = await loadLayoutApi({
      VITE_API_BASE_URL: 'https://api.example.com',
    })

    await getPublicActiveLayout('loc-1')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://api.example.com/locations/loc-1/layout/active')
  })

  it('översätter 404 till "ingen publicerad planritning"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 404 })),
    )
    const { getPublicActiveLayout } = await loadLayoutApi({
      VITE_API_BASE_URL: 'https://api.example.com',
    })

    await expect(getPublicActiveLayout('loc-1')).rejects.toThrow(
      'Ingen publicerad planritning hittades',
    )
  })
})

describe('layoutViewBox', () => {
  it('täcker elementens fulla utsträckning exakt för orealroterade element', async () => {
    const { layoutViewBox } = await loadLayoutApi()
    const elements: LayoutElement[] = [
      {
        elementId: 'wall-1',
        type: 'wall',
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        height: 3,
        depth: 0.2,
        rotationY: 0,
      },
      {
        elementId: 'table-a',
        type: 'table',
        x: 8,
        y: 0,
        z: 6,
        width: 1,
        height: 0.75,
        depth: 1,
        rotationY: 0,
        shape: 'round',
        seats: 2,
        zone: 'main',
      },
    ]

    const box = layoutViewBox(elements)

    // Väggen (rot=0): halva bredden 2 på x, halva djupet 0.1 på z.
    expect(box.minX).toBeCloseTo(-2, 5)
    // Bordet (rot=0): halva bredden 0.5 på x → övre gräns 8.5.
    expect(box.minX + box.width).toBeCloseTo(8.5, 5)
    expect(box.minZ).toBeCloseTo(-0.1, 5)
    expect(box.minZ + box.height).toBeCloseTo(6.5, 5)
  })

  it('en lång tunn vägg roterad 90° blåser inte upp den korta axeln till halva diagonalen', async () => {
    // Regression: en tidigare version använde samma halv-diagonal (~8 m för
    // en 16×0.2 m vägg) som marginal på BÅDA axlarna, vilket gjorde hela
    // rummets viewBox nästan kvadratisk i stället för smalt och långt.
    const { layoutViewBox } = await loadLayoutApi()
    const wall: LayoutElement = {
      elementId: 'wall-1',
      type: 'wall',
      x: 0,
      y: 0,
      z: 0,
      width: 16,
      height: 1.8,
      depth: 0.2,
      rotationY: 90,
    }

    const box = layoutViewBox([wall])

    // Roterad 90°: längden (16) hamnar nu på z, tjockleken (0.2) på x.
    expect(box.width).toBeCloseTo(0.2, 5)
    expect(box.height).toBeCloseTo(16, 5)
  })

  it('ger en 1×1-box för en tom layout i stället för division med noll', async () => {
    const { layoutViewBox } = await loadLayoutApi()
    expect(layoutViewBox([])).toEqual({ minX: 0, minZ: 0, width: 1, height: 1 })
  })
})

describe('groupElementsByFloor', () => {
  it('delar upp elementen per våning i level-ordning', async () => {
    const { groupElementsByFloor } = await loadLayoutApi()
    const layout: PublicActiveLayout = {
      floors: [
        { floorId: 'f2', name: 'Våning 2', level: 1 },
        { floorId: 'f1', name: 'Våning 1', level: 0 },
      ],
      elements: [
        {
          elementId: 'table-1',
          type: 'table',
          x: 0,
          y: 0,
          z: 0,
          width: 1,
          height: 0.75,
          depth: 1,
          rotationY: 0,
          shape: 'round',
          seats: 2,
          zone: 'main',
          floorId: 'f1',
        },
        {
          elementId: 'table-2',
          type: 'table',
          x: 0,
          y: 0,
          z: 0,
          width: 1,
          height: 0.75,
          depth: 1,
          rotationY: 0,
          shape: 'round',
          seats: 4,
          zone: 'main',
          floorId: 'f2',
        },
      ],
    }

    const groups = groupElementsByFloor(layout)

    expect(groups.map((g) => g.floor?.floorId)).toEqual(['f1', 'f2'])
    expect(groups[0].elements).toEqual([layout.elements[0]])
    expect(groups[1].elements).toEqual([layout.elements[1]])
  })

  it('ger en enda grupp med floor: null för en platt legacy-layout', async () => {
    const { groupElementsByFloor } = await loadLayoutApi()
    const layout: PublicActiveLayout = { floors: [], elements: [] }

    expect(groupElementsByFloor(layout)).toEqual([{ floor: null, elements: [] }])
  })
})
