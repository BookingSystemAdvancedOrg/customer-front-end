import { useRef } from 'react'
import type { ReactNode } from 'react'
import { CountUp } from '../react/CountUp'
import { useLiquidFill } from '../react/hooks'

const STAGGER_MS = 140

export interface StatTileProps {
  label: ReactNode
  /** Formatted value ("12", "1 250 kr", "-"); counts up when it arrives. */
  value: string
  note?: ReactNode
  /** How the figure is doing against the comparison: colours the value. */
  trend?: 'good' | 'bad'
  /** The change, shown top right ("+12 %"). */
  delta?: ReactNode
  /** No data yet: the tile waits. */
  loading?: boolean
  loadingLabel?: string
  /** Position in a row: each tile starts a little after the previous. */
  index?: number
  /** Pour the liquid fill and count up (false: show the end state). */
  reveal?: boolean
  className?: string
}

/**
 * A key figure on a tile that fills with liquid when the number arrives: the
 * jet pours from above, the surface sways and the figure counts up. The text
 * always sits on top. Reduced motion: the end state at once.
 */
export function StatTile({ label, value, note, trend, delta, loading = false, loadingLabel = 'Hämtar…', index = 0, reveal = true, className }: StatTileProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const liquid = useLiquidFill(host, canvas, { active: !loading, enabled: reveal, delayMs: index * STAGGER_MS })
  const touch = (clientX: number, force: number) => {
    const rect = host.current?.getBoundingClientRect()
    if (rect) liquid.touch((clientX - rect.left) / rect.width, force)
  }
  return (
    <div
      ref={host}
      className={['bq-stat', trend && `bq-stat--${trend}`, className].filter(Boolean).join(' ')}
      onPointerEnter={(e) => touch(e.clientX, 3.5)}
      onPointerLeave={(e) => touch(e.clientX, -2)}
    >
      <canvas ref={canvas} className="bq-stat__liquid" aria-hidden="true" />
      <p className="bq-stat__label">
        {label}
        {delta && !loading && <span className="bq-stat__delta">{delta}</span>}
      </p>
      <p className="bq-stat__value">{loading ? '…' : <CountUp reveal={reveal} delayMs={index * STAGGER_MS}>{value}</CountUp>}</p>
      {(note || loading) && <p className="bq-stat__note">{loading ? loadingLabel : note}</p>}
    </div>
  )
}
