import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OpeningHoursModal } from './OpeningHoursModal'
import { WithSite } from '../test/siteFixture'
import { siteConfig } from '../test/siteData'

describe('OpeningHoursModal', () => {
  it('lists upcoming special days under the weekly hours', () => {
    const config = siteConfig()
    config.locations[0].specialDays = [{ date: '2026-12-24', kind: 'closed', note: 'Julafton' }]
    render(<WithSite config={config}><OpeningHoursModal open onClose={() => {}} /></WithSite>)
    expect(screen.getByRole('heading', { name: 'Avvikande öppettider' })).toBeInTheDocument()
    expect(screen.getByText('Stängt (Julafton)')).toBeInTheDocument()
  })

  it('shows no special section without special days', () => {
    render(<WithSite><OpeningHoursModal open onClose={() => {}} /></WithSite>)
    expect(screen.queryByRole('heading', { name: 'Avvikande öppettider' })).toBeNull()
  })
})
