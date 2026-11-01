import { Suspense, lazy } from 'react'
import type { ComponentType } from 'react'
import { SITE_SLOTS } from './contracts'
import type { SiteSlotId } from './contracts'
import { useSite } from './SiteContext'

/**
 * Platser i flödena där en funktion (presentkort, kö ...) kan lägga in sin
 * egen del. Funktionen äger komponenten; här finns bara var den laddas och
 * när den visas (kontraktet SITE_SLOTS).
 */
export interface SiteSlotProps {
  'boka.full': { locationId: string }
  'bestall.checkout.giftcard': { value: string; onChange: (v: string) => void; totalOre: number }
}

// lazy() hämtar komponenten först när platsen ritas; ett id som saknas här fäller typkontrollen.
const SLOT_COMPONENTS: { [K in SiteSlotId]: ComponentType<SiteSlotProps[K]> } = {
  'boka.full': lazy(() => import('../features/ko/JoinQueueLink')),
  'bestall.checkout.giftcard': lazy(() => import('../features/presentkort/GiftCardField')),
}

/** Visar platsens komponent bara när restaurangen har funktionen (och, för kön, tillåter att gäster ställer sig i kö). */
export function Slot<K extends SiteSlotId>({ id, props }: { id: K; props: SiteSlotProps[K] }) {
  const { config, location } = useSite()
  const { feature } = SITE_SLOTS[id]
  const on = (Array.isArray(feature) ? feature : [feature]).some((k) => config.tenant.features[k])
  if (!on) return null
  if (id === 'boka.full' && !location.waitlist?.publicJoin) return null
  const Component = SLOT_COMPONENTS[id] as ComponentType<SiteSlotProps[K]>
  return (
    <Suspense fallback={null}>
      <Component {...props} />
    </Suspense>
  )
}
