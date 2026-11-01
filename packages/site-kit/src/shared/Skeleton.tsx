import type { CSSProperties, ReactNode } from 'react'

/**
 * Medan en sida hämtar sin data: samma kort och rader som den riktiga sidan,
 * med suddiga glasrutor där text, bilder och priser kommer och ett långsamt
 * glasskimmer, som skeletten i admin. När datan är här hamnar den där
 * gästen redan ser rutorna. Minska rörelse: rutorna står still.
 */

type Size = number | string

/** En suddig glasruta. */
export function SkelBlock({ w = '100%', h = 14, round, style }: { w?: Size; h?: Size; round?: boolean; style?: CSSProperties }) {
  return <span className={`skel-block${round ? ' skel-round' : ''}`} style={{ width: w, height: h, ...style }} />
}

/** Ytterst: talar om för skärmläsare vad som hämtas. */
export function SkelPage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="skel" role="status" aria-label={label} aria-busy="true">
      <i className="skel-sheen" aria-hidden="true" />
      {children}
    </div>
  )
}

/** Några textrader, den sista kortare. */
export function SkelLines({ n = 3 }: { n?: number }) {
  return (
    <div className="skel-lines">
      {Array.from({ length: n }, (_, i) => (
        <SkelBlock key={i} w={i === n - 1 ? '62%' : '100%'} h={12} />
      ))}
    </div>
  )
}

/** Rätter som i menyn: bild, namn, beskrivning och pris. */
export function SkelDishes({ n = 4, label = 'Hämtar menyn' }: { n?: number; label?: string }) {
  return (
    <SkelPage label={label}>
      <SkelBlock w={140} h={26} />
      {Array.from({ length: n }, (_, i) => (
        <div className="skel-dish" key={i}>
          <SkelBlock w={76} h={76} style={{ borderRadius: 14 }} />
          <div className="skel-lines">
            <SkelBlock w="44%" h={15} />
            <SkelBlock w="78%" h={12} />
          </div>
          <SkelBlock w={56} h={15} />
        </div>
      ))}
    </SkelPage>
  )
}

/** Ett kort med rubrik och några rader (bokning, förfrågan, catering). */
export function SkelCard({ label, lines = 4 }: { label: string; lines?: number }) {
  return (
    <SkelPage label={label}>
      <div className="skel-card">
        <SkelBlock w="40%" h={24} />
        <SkelLines n={lines} />
        <SkelBlock w={160} h={44} round />
      </div>
    </SkelPage>
  )
}
