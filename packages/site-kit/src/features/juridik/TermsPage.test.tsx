import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TermsPage from './TermsPage'
import { WithSite } from '../../test/siteFixture'
import { siteConfig } from '../../test/siteData'

describe('TermsPage', () => {
  it('follows the location\'s real card guarantee and grace period', () => {
    const config = siteConfig()
    config.locations[0].guarantee = { minPartySize: 6, noShowFeePerPerson: 250, lateCancelFeePerPerson: 150, cancelCutoffHours: 24 }
    config.locations[0].gracePeriodMinutes = 20
    render(<WithSite config={config}><TermsPage /></WithSite>)

    expect(screen.getByRole('heading', { name: 'Kortgaranti' })).toBeInTheDocument()
    expect(screen.getByText('Uteblivet besök: 250 kr/person.')).toBeInTheDocument()
    expect(screen.getByText(/Vi håller bordet i 20 minuter/)).toBeInTheDocument()
    expect(screen.getByText(/Du kan avboka kostnadsfritt fram till 24 timmar före bokad tid/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Läs integritetspolicyn' })).toHaveAttribute('href', '/integritetspolicy')
  })

  it('without a guarantee shows the simple version', () => {
    render(<WithSite><TermsPage /></WithSite>)
    expect(screen.queryByRole('heading', { name: 'Kortgaranti' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Betalning' })).toBeNull()
    expect(screen.getByText('Du kan avboka kostnadsfritt fram till bokad tid.')).toBeInTheDocument()
  })
})
