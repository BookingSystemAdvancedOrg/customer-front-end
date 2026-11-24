import { paidWithParts } from './paidWith'
import type { PaidWith } from './paidWith'

/** "Betald med Swish" under summan på gästens kvitto; inget utan känt betalsätt. */
export function PaidWithNote({ paidWith }: { paidWith?: PaidWith | null }) {
  const parts = paidWithParts(paidWith)
  if (!parts) return null
  return (
    <p className="paid-with">
      {`${parts.lead} `}
      {parts.properName ? <span translate="no" dir="ltr">{parts.name}</span> : parts.name}
    </p>
  )
}
