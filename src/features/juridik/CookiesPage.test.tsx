import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import CookiesPage from './CookiesPage'
import { STORAGE_REGISTRY } from '../../shared/storageRegistry'

vi.mock('../../shared/SiteContext', () => ({
  useSite: () => ({ config: { tenant: { name: 'Testkrogen' } } }),
}))

describe('CookiesPage', () => {
  it('lists every registry entry, so the page matches what the site stores', () => {
    render(
      <MemoryRouter>
        <CookiesPage />
      </MemoryRouter>,
    )
    const table = within(screen.getByRole('table'))
    for (const entry of STORAGE_REGISTRY) {
      // getAll: two entries may share a text without this test caring.
      expect(table.getAllByText(entry.name).length).toBeGreaterThan(0)
      expect(table.getAllByText(entry.purpose).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(/inga cookies för statistik, spårning eller reklam/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'integritetspolicyn' })).toHaveAttribute('href', '/integritetspolicy')
  })

  it('has no consent-requiring entries, so the site needs no banner', () => {
    const needsConsent = STORAGE_REGISTRY.filter((e) => e.category === 'analys' || e.category === 'marknadsföring')
    expect(needsConsent).toEqual([])
  })
})
