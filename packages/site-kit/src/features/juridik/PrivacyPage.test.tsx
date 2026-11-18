import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PrivacyPage from './PrivacyPage'
import { STORAGE_REGISTRY } from '../../shared/storageRegistry'

vi.mock('../../shared/SiteContext', () => ({
  useSite: () => ({
    config: {
      tenant: { name: 'Testkrogen' },
      legal: { legalName: 'Testkrogen AB', orgNumber: '556000-0000', address: 'Gatan 1', contactEmail: 'hej@test.se', contactPhone: '+46812345678' },
    },
  }),
}))

describe('PrivacyPage cookie table', () => {
  it('shows every registry entry, so the policy matches what the site stores', () => {
    render(<PrivacyPage />)
    for (const entry of STORAGE_REGISTRY) {
      const name = entry.name.split(', ').join('')
      expect(screen.getByText((_, el) => el?.tagName !== 'TD' && el?.textContent === name && el.children.length <= 1)).toBeInTheDocument()
      expect(screen.getByText(entry.purpose)).toBeInTheDocument()
    }
    expect(screen.getByText(/inga cookies för statistik, spårning eller reklam/)).toBeInTheDocument()
  })

  it('puts the two Stripe cookies on two lines and shows non-keys as plain text', () => {
    const { container } = render(<PrivacyPage />)
    const codes = [...container.querySelectorAll('.storage-table code')].map((c) => c.innerHTML)
    expect(codes).toContain('__stripe_mid<br>__stripe_sid')
    expect(codes).toContain('aws-waf-token')
    expect(codes).not.toContain('Besöksstatistik')
  })

  it('names everything clearing the browser forgets', () => {
    const { container } = render(<PrivacyPage />)
    expect(container.textContent).toContain('Då glöms dina val på sajten (plats, ljust/mörkt läge, klickljud, varukorg och plats i kön)')
  })
})

describe('PrivacyPage contact', () => {
  it('shows the contact number in Swedish form with an E.164 tel: link', () => {
    const { container } = render(<PrivacyPage />)
    const links = screen.getAllByRole('link', { name: '08-123 456 78' })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', 'tel:+46812345678')
    expect(container.textContent).toContain('Kontakt: hej@test.se, 08-123 456 78.')
    expect(container.textContent).toContain('Kontakta oss på hej@test.se, 08-123 456 78.')
    expect(container.textContent).not.toContain('+46812345678')
  })
})
