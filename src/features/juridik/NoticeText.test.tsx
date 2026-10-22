import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NoticeText, parseNotice } from './NoticeText'
import PrivacyPage from './PrivacyPage'
import { SiteContext } from '../../shared/SiteContext'
import { siteConfig } from '../../test/siteData'

describe('parseNotice', () => {
  it('reads headings, lists and paragraphs', () => {
    expect(parseNotice('## Rubrik\nEtt stycke\nsom fortsätter.\n\n- ett\n- två\n\nSlut.')).toEqual([
      { kind: 'h2', text: 'Rubrik' },
      { kind: 'p', text: 'Ett stycke som fortsätter.' },
      { kind: 'ul', items: ['ett', 'två'] },
      { kind: 'p', text: 'Slut.' },
    ])
  })
})

describe('NoticeText', () => {
  it('never renders HTML from the text', () => {
    const { container } = render(<NoticeText body={'<img src=x onerror=alert(1)> hej'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument()
  })
})

describe('PrivacyPage with the restaurant\'s own text', () => {
  it('shows the saved text and still the cookie table', () => {
    const config = {
      ...siteConfig(),
      privacy: {
        notice: { body: '## Vår egen rubrik\nVi behandlar bara det vi måste.', version: 3, updatedAt: null, custom: true },
        retention: { bookingDays: 395, bookingMonths: 13, guestMonths: 24, cancelledMonths: 12, accountingYears: 7 },
        marketingConsent: null,
      },
    }
    render(
      <MemoryRouter>
        <SiteContext.Provider value={{ config, location: config.locations[0], setLocationId: () => {} }}>
          <PrivacyPage />
        </SiteContext.Provider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Vår egen rubrik' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Personuppgiftsansvarig' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cookies och lagring' })).toBeInTheDocument()
  })
})
