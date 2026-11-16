import { Menu } from '../meny/Menu'
import type { SiteConfig } from '../../shared/site'
import { OpeningHoursTable } from './OpeningHoursTable'
import type { LiveSlots, SiteFeatures } from './SitePage'

/** The flows the app has routes for (App.tsx): a CTA to any other one would lead nowhere. */
export function siteFeatures(config: SiteConfig): SiteFeatures {
  const f = config.tenant.features
  return { reservations: !!f.reservations, ordering: !!f.ordering, catering: !!f.catering }
}

/** The browser's live blocks: the menu under the block's own heading, the hours table. */
export const liveSlots: LiveSlots = {
  menu: () => <Menu hideHeading />,
  openingHours: () => <OpeningHoursTable />,
}
