import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteContext } from '../../shared/SiteContext'
import { Menu } from './Menu'

const getMenu = vi.fn()
vi.mock('../../shared/api', async (orig) => ({
  ...(await orig<typeof import('../../shared/api')>()),
  isApiConfigured: () => true,
}))
vi.mock('./menuApi', async (orig) => ({
  ...(await orig<typeof import('./menuApi')>()),
  getPublicMenuWithCategories: (...a: unknown[]) => getMenu(...a),
}))

const dish = { menuItemId: 'd1', name: 'Pasta', description: '', price: 120, category: 'mains', active: true, allergens: [] }
const site = (ui: React.ReactNode) => (
  <SiteContext.Provider value={{ config: {}, location: { locationId: 'l1' }, setLocationId: () => {} } as never}>{ui}</SiteContext.Provider>
)

describe('Menu', () => {
  beforeEach(() => getMenu.mockReset())

  it('shows the error with a retry that fetches again in place', async () => {
    getMenu
      .mockRejectedValueOnce(new Error('Menyn kunde inte hämtas. Kontrollera anslutningen och försök igen.'))
      .mockResolvedValueOnce({ items: [dish], categories: [{ categoryId: 'mains', name: 'Varmrätter' }] })
    render(site(<Menu />))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kontrollera anslutningen')
    screen.getByRole('button', { name: 'Försök igen' }).click()
    expect(await screen.findByText('Pasta')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(getMenu).toHaveBeenCalledTimes(2)
  })

  it('has its own Meny heading unless the page above already has one', async () => {
    getMenu.mockResolvedValue({ items: [dish], categories: [{ categoryId: 'mains', name: 'Varmrätter' }] })
    const { unmount } = render(site(<Menu />))
    expect(await screen.findByRole('heading', { level: 2, name: 'Meny' })).toBeInTheDocument()
    unmount()
    render(site(<Menu hideHeading />))
    await screen.findByText('Pasta')
    expect(screen.queryByRole('heading', { level: 2, name: 'Meny' })).toBeNull()
  })
})
