import type { CSSProperties, ReactNode } from 'react'

/**
 * Skeletons while a page loads: soft blurred glass blocks that breathe, with
 * a slow sheen across cards. `Skeleton` is the region screen readers hear
 * ("Hämtar"); the blocks inside are hidden from them.
 */
export function Skeleton({ label = 'Hämtar', children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={['bq-skel', className].filter(Boolean).join(' ')} role="status" aria-busy="true" aria-label={label}>
      <div aria-hidden="true" className="bq-skel__inner">
        {children}
      </div>
    </div>
  )
}

export function SkelBlock({ width = '100%', height = 14, round = false }: { width?: number | string; height?: number | string; round?: boolean }) {
  const style = { '--bq-skel-w': typeof width === 'number' ? `${width}px` : width, '--bq-skel-h': typeof height === 'number' ? `${height}px` : height } as CSSProperties
  return <span className={`bq-skel-block${round ? ' bq-skel-block--round' : ''}`} style={style} />
}

const WIDTHS = ['92%', '78%', '85%', '64%', '88%', '70%']

export function SkelLines({ count = 3 }: { count?: number }) {
  return (
    <span className="bq-skel-lines">
      {Array.from({ length: count }, (_, i) => (
        <SkelBlock key={i} width={WIDTHS[i % WIDTHS.length]} />
      ))}
    </span>
  )
}

export function SkelCard({ lines = 3 }: { lines?: number }) {
  return (
    <span className="bq-skel-card">
      <SkelBlock width="40%" height={18} />
      <SkelLines count={lines} />
      <span className="bq-skel-sheen" />
    </span>
  )
}
