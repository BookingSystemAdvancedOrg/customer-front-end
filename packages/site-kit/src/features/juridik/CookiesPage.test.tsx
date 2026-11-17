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
      const name = entry.name.split(', ').join('')
      expect(table.getAllByText((_, el) => el?.tagName !== 'TD' && el?.textContent === name && el.children.length <= 1).length).toBeGreaterThan(0)
      expect(table.getAllByText(entry.purpose).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(/inga cookies för statistik, spårning eller reklam/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'integritetspolicyn' })).toHaveAttribute('href', '/integritetspolicy')
    expect(screen.getByText(/Då glöms dina val på sajten \(plats, ljust\/mörkt läge, klickljud, varukorg och plats i kön\)/)).toBeInTheDocument()
    const codes = [...document.querySelectorAll('.storage-table code')].map((c) => c.innerHTML)
    expect(codes).toContain('__stripe_mid<br>__stripe_sid')
    expect(codes).not.toContain('Besöksstatistik')
  })

  it('has no consent-requiring entries, so the site needs no banner', () => {
    const needsConsent = STORAGE_REGISTRY.filter((e) => e.category === 'analys' || e.category === 'marknadsföring')
    expect(needsConsent).toEqual([])
  })
})
