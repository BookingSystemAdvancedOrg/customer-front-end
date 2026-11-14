import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMenuItem } from './menuApi'

/** Miljöberoende värden läses vid modul-laddning - importera om per test. */
async function loadMenuApi(env: Record<string, string>) {
  vi.resetModules()
  const { configureSiteKit } = await import('../../config')
  configureSiteKit({ apiBaseUrl: env.VITE_API_BASE_URL ?? '', menuImageBaseUrl: env.VITE_MENU_IMAGE_BASE_URL ?? '' })
  return import('./menuApi')
}

function dish(overrides: Partial<PublicMenuItem>): PublicMenuItem {
  return {
    menuItemId: 'id',
    name: 'Rätt',
    description: '',
    price: 100,
    category: 'mains',
    imageKey: '',
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('getPublicMenu', () => {
  it('hämtar publika menyn och filtrerar bort inaktiva rätter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            dish({ menuItemId: 'a', active: true }),
            dish({ menuItemId: 'b', active: false }),
            dish({ menuItemId: 'c' }),
          ],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { getPublicMenu } = await loadMenuApi({
      VITE_API_BASE_URL: 'https://api.example.com',
    })

    const items = await getPublicMenu('loc-1')

    expect(items.map((i) => i.menuItemId)).toEqual(['a', 'c'])
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://api.example.com/locations/loc-1/menu')
  })

  it('URL-kodar plats-ID:t', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { getPublicMenu } = await loadMenuApi({
      VITE_API_BASE_URL: 'https://api.example.com',
    })

    await getPublicMenu('a/b?c')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://api.example.com/locations/a%2Fb%3Fc/menu')
  })

  it('översätter serverfel till ett kundvänligt meddelande', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
      ),
    )
    const { getPublicMenu } = await loadMenuApi({
      VITE_API_BASE_URL: 'https://api.example.com',
    })

    await expect(getPublicMenu('loc-1')).rejects.toThrow(
      'Menyn kunde inte hämtas just nu',
    )
  })
})

describe('menuImagePosition', () => {
  it('ger restaurangens fokuspunkt, annars mitten', async () => {
    const { menuImagePosition } = await loadMenuApi({})
    expect(menuImagePosition({ x: 20, y: 80 })).toBe('20% 80%')
    expect(menuImagePosition(null)).toBe('50% 50%')
    expect(menuImagePosition(undefined)).toBe('50% 50%')
    expect(menuImagePosition({ x: 140, y: Number.NaN })).toBe('100% 50%')
  })
})

describe('menuImageUrl', () => {
  it('bygger CDN-URL av imageKey när bas-URL finns', async () => {
    const { menuImageUrl } = await loadMenuApi({
      VITE_MENU_IMAGE_BASE_URL: 'https://cdn.example.com/',
    })
    expect(menuImageUrl('menu-images/abc.png')).toBe(
      'https://cdn.example.com/menu-images/abc.png',
    )
  })

  it('ger null utan bas-URL eller utan nyckel', async () => {
    const { menuImageUrl } = await loadMenuApi({})
    expect(menuImageUrl('menu-images/abc.png')).toBeNull()
    const withBase = await loadMenuApi({
      VITE_MENU_IMAGE_BASE_URL: 'https://cdn.example.com',
    })
    expect(withBase.menuImageUrl('   ')).toBeNull()
  })
})

describe('groupByCategory', () => {
  it('grupperar i visningsordning och sorterar på namn', async () => {
    const { groupByCategory } = await loadMenuApi({})
    const groups = groupByCategory([
      dish({ menuItemId: '1', category: 'drinks', name: 'Öl' }),
      dish({ menuItemId: '2', category: 'starters', name: 'Bruschetta' }),
      dish({ menuItemId: '3', category: 'starters', name: 'Arancini' }),
    ])
    expect(groups.map((g) => g.category)).toEqual(['starters', 'drinks'])
    expect(groups[0].items.map((i) => i.name)).toEqual(['Arancini', 'Bruschetta'])
  })
})

describe('formatPrice', () => {
  it('visar heltal utan decimaler och ören med två', async () => {
    const { formatPrice } = await loadMenuApi({})
    expect(formatPrice(95)).toBe('95 kr')
    expect(formatPrice(89.5)).toBe(`89${','}50 kr`)
  })
})

describe('categories and options', () => {
  const dish = (over: Record<string, unknown> = {}) => ({
    menuItemId: 'p', name: 'Pizza', description: '', price: 100, category: 'cpizza', imageKey: null, ...over,
  }) as import('./menuApi').PublicMenuItem

  it('groups by the given categories in order, unknown ones last under Övrigt', async () => {
    const { groupByCategory } = await import('./menuApi')
    const groups = groupByCategory(
      [dish(), dish({ menuItemId: 'b', name: 'Bira', category: 'col' }), dish({ menuItemId: 'x', category: 'gone' })],
      [{ categoryId: 'col', name: 'Öl' }, { categoryId: 'cpizza', name: 'Pizzor' }],
    )
    expect(groups.map((g) => g.label)).toEqual(['Öl', 'Pizzor', 'Övrigt'])
  })

  it('prices and checks option picks like the server', async () => {
    const { optionsOre, validPicks } = await import('./menuApi')
    const item = dish({ options: [
      { name: 'Storlek', required: true, maxChoices: 1, choices: [{ name: 'Stor', price: 30 }, { name: 'Normal', price: 0 }] },
      { name: 'Extra', required: false, maxChoices: 1, choices: [{ name: 'Ost', price: 10.5 }] },
    ] })
    expect(optionsOre(item, [{ group: 'Storlek', choice: 'Stor' }, { group: 'Extra', choice: 'Ost' }])).toBe(4050)
    expect(validPicks(item, [{ group: 'Storlek', choice: 'Stor' }])).toBe(true)
    expect(validPicks(item, [])).toBe(false)
    expect(validPicks(item, [{ group: 'Storlek', choice: 'Stor' }, { group: 'Storlek', choice: 'Normal' }])).toBe(false)
    expect(validPicks(item, [{ group: 'Storlek', choice: 'Jätte' }])).toBe(false)
  })

  it('reads the restaurant categories with the menu, defaults for an older API', async () => {
    const { getPublicMenuWithCategories, DEFAULT_CATEGORIES } = await import('./menuApi')
    expect(DEFAULT_CATEGORIES.map((c) => c.name)).toEqual(['Förrätter', 'Varmrätter', 'Efterrätter', 'Drycker'])
    expect(typeof getPublicMenuWithCategories).toBe('function')
  })
})
