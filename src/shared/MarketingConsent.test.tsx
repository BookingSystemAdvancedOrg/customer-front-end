import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WithSite } from '../test/siteFixture'
import { siteConfig } from '../test/siteData'
import type { SiteConfig, SitePrivacy } from './site'
import { GuestDataNotice } from './GuestDataNotice'
import { MarketingConsent, NO_CONSENT, consentFields } from './MarketingConsent'
import type { ConsentChoice } from './MarketingConsent'

const PRIVACY: SitePrivacy = {
  notice: { body: '## Text', version: 0, updatedAt: null, custom: false },
  retention: { bookingDays: 395, bookingMonths: 13, guestMonths: 24, cancelledMonths: 12, accountingYears: 7 },
  marketingConsent: {
    version: 'offers_v1',
    label: 'Ja, Testkrogen får skicka mig erbjudanden och nyheter.',
    channelQuestion: 'Hur vill du få dem?',
    channels: [{ value: 'email', label: 'E-post' }, { value: 'sms', label: 'SMS' }],
  },
}

function config(privacy?: SitePrivacy, marketing = true): SiteConfig {
  const c = siteConfig({ features: { reservations: true, ordering: true, catering: false, terminal: false, marketing } })
  return privacy ? { ...c, privacy } : c
}

let last: ConsentChoice = NO_CONSENT

function Harness() {
  const [value, setValue] = useState<ConsentChoice>(NO_CONSENT)
  return (
    <MarketingConsent
      value={value}
      onChange={(v) => {
        last = v
        setValue(v)
      }}
    />
  )
}

describe('MarketingConsent', () => {
  it('is unticked, shows the server wording and asks for channels only when ticked', async () => {
    const user = userEvent.setup()
    render(<WithSite config={config(PRIVACY)}><Harness /></WithSite>)
    const box = screen.getByRole('checkbox', { name: PRIVACY.marketingConsent!.label })
    expect(box).not.toBeChecked()
    expect(screen.queryByRole('group', { name: 'Hur vill du få dem?' })).not.toBeInTheDocument()
    await user.click(box)
    expect(screen.getByRole('radio', { name: 'E-post' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Båda' }))
    expect(last).toEqual({ checked: true, channels: ['email', 'sms'] })
    await user.click(screen.getByRole('radio', { name: 'SMS' }))
    expect(last).toEqual({ checked: true, channels: ['sms'] })
  })

  it('offers e-mail only without a choice when the server offers one channel, and links the policy', async () => {
    const user = userEvent.setup()
    const emailOnly = { ...PRIVACY, marketingConsent: { ...PRIVACY.marketingConsent!, channels: [{ value: 'email' as const, label: 'E-post' }] } }
    render(<WithSite config={config(emailOnly)}><Harness /></WithSite>)
    expect(screen.getByText(/Via e-post\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Läs mer i integritetspolicyn' })).toHaveAttribute('href', '/integritetspolicy')
    await user.click(screen.getByRole('checkbox'))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(last).toEqual({ checked: true, channels: ['email'] })
  })

  it('is hidden when the restaurant has no marketing', () => {
    render(<WithSite config={config({ ...PRIVACY, marketingConsent: null }, false)}><Harness /></WithSite>)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('falls back to the old e-mail box with an older backend', () => {
    render(<WithSite config={config(undefined, true)}><Harness /></WithSite>)
    expect(screen.getByRole('checkbox', { name: /via e-post/ })).toBeInTheDocument()
  })
})

describe('consentFields', () => {
  it('sends nothing without a tick', () => {
    expect(consentFields(NO_CONSENT, PRIVACY, true)).toEqual({})
  })

  it('sends the channels and the wording version', () => {
    expect(consentFields({ checked: true, channels: ['sms'] }, PRIVACY, true)).toEqual({
      marketingConsent: { channels: ['sms'], textVersion: 'offers_v1' },
    })
  })

  it('uses the old flag only for e-mail with an older backend', () => {
    expect(consentFields({ checked: true, channels: ['email'] }, undefined, true)).toEqual({ marketingOptIn: true })
    expect(consentFields({ checked: true, channels: ['email'] }, undefined, false)).toEqual({})
  })
})

describe('GuestDataNotice', () => {
  it('says what, why, how long and links the privacy notice', () => {
    render(<WithSite config={config(PRIVACY)}><GuestDataNotice kind="order" /></WithSite>)
    const text = screen.getByText(/laga och lämna ut beställningen/)
    expect(text).toHaveTextContent('24 månader')
    expect(text).toHaveTextContent('7 år')
    expect(text).toHaveTextContent('Testkrogen är personuppgiftsansvarig')
    expect(screen.getByRole('link', { name: 'Läs integritetspolicyn' })).toHaveAttribute('href', '/integritetspolicy')
  })

  it('works without retention data from an older backend', () => {
    render(<WithSite config={config()}><GuestDataNotice kind="booking" /></WithSite>)
    expect(screen.getByText(/cirka 13 månader efter besöket/)).toBeInTheDocument()
  })
})
