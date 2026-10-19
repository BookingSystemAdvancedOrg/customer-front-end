import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PrivacyPage from './PrivacyPage'
import { STORAGE_REGISTRY } from '../../shared/storageRegistry'

vi.mock('../../shared/SiteContext', () => ({
  useSite: () => ({
    config: {
      tenant: { name: 'Testkrogen' },
      legal: { legalName: 'Testkrogen AB', orgNumber: '556000-0000', address: 'Gatan 1', contactEmail: 'hej@test.se' },
    },
  }),
}))

describe('PrivacyPage cookie table', () => {
  it('shows every registry entry, so the policy matches what the site stores', () => {
    render(<PrivacyPage />)
    for (const entry of STORAGE_REGISTRY) {
      expect(screen.getByText(entry.name)).toBeInTheDocument()
      expect(screen.getByText(entry.purpose)).toBeInTheDocument()
    }
    expect(screen.getByText(/inga cookies för statistik, spårning eller reklam/)).toBeInTheDocument()
  })
})
