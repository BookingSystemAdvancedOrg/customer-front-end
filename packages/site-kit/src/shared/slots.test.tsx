import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WithSite } from '../test/siteFixture'
import { siteConfig } from '../test/siteData'
import { Slot } from './slots'

// Platshållarna ritar inget; här står en markör i deras ställe.
vi.mock('../features/ko/JoinQueueLink', () => ({
  default: ({ locationId }: { locationId: string }) => <p>kö {locationId}</p>,
}))
vi.mock('../features/presentkort/GiftCardField', () => ({
  default: ({ totalOre }: { totalOre: number }) => <p>presentkort {totalOre}</p>,
}))

const OFF = { reservations: true, ordering: true, catering: false, terminal: false }

function giftCard(features: Record<string, boolean>) {
  return render(
    <WithSite config={siteConfig({ features })}>
      <Slot id="bestall.checkout.giftcard" props={{ value: '', onChange: () => {}, totalOre: 12500 }} />
    </WithSite>,
  )
}

function queue(features: Record<string, boolean>, publicJoin?: boolean) {
  const config = siteConfig({ features })
  if (publicJoin !== undefined) config.locations[0].waitlist = { publicJoin }
  return render(
    <WithSite config={config}>
      <Slot id="boka.full" props={{ locationId: 'loc-1' }} />
    </WithSite>,
  )
}

describe('Slot', () => {
  it('renders nothing while the feature is off', () => {
    const { container } = giftCard(OFF)
    expect(container).toBeEmptyDOMElement()
  })

  it('loads the feature component with its props when the feature is on', async () => {
    giftCard({ ...OFF, giftCards: true })
    expect(await screen.findByText('presentkort 12500')).toBeInTheDocument()
  })

  it('shows the queue link only with waitlist on and public sign-up at the location', async () => {
    expect(queue({ ...OFF, waitlist: true }).container).toBeEmptyDOMElement()
    expect(queue({ ...OFF, waitlist: true }, false).container).toBeEmptyDOMElement()
    expect(queue(OFF, true).container).toBeEmptyDOMElement()
    queue({ ...OFF, waitlist: true }, true)
    expect(await screen.findByText('kö loc-1')).toBeInTheDocument()
  })
})
