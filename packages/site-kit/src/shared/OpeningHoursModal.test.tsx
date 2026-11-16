import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('moves focus into the dialog, keeps Tab inside and returns focus to the opener', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Öppet nu</button>
          <a href="/meny">Meny</a>
          <OpeningHoursModal open={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    render(<WithSite><Harness /></WithSite>)
    const opener = screen.getByRole('button', { name: 'Öppet nu' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog')
    const close = dialog.querySelector('button')!
    expect(close).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
})
