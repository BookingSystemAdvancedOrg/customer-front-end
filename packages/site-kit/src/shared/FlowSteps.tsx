/**
 * Stegraden: var gästen är i ett flöde och vad som kommer sedan. Ritas som
 * numrerade rutor med streckade linjer emellan, som perforeringen mellan
 * kvitton. Klara steg får en bock, det aktuella restaurangens färg, de
 * kommande bara en kontur. På smala skärmar visas bara det aktuella stegets
 * namn, numren räcker för resten.
 */
export interface FlowStep {
  label: string
}

export function FlowSteps({
  steps,
  current,
  done = false,
  label = 'Steg',
}: {
  steps: FlowStep[]
  /** 1-baserat. */
  current: number
  /** Hela flödet är klart (alla steg bockade). */
  done?: boolean
  label?: string
}) {
  const at = done ? steps.length : Math.min(Math.max(current, 1), steps.length)
  return (
    <ol className="flow" aria-label={`${label}: steg ${at} av ${steps.length}`}>
      {steps.map((step, i) => {
        const n = i + 1
        const state = done || n < at ? 'done' : n === at ? 'current' : 'next'
        return (
          <li key={step.label} className={`flow-step is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="flow-no" aria-hidden="true">
              {state === 'done' ? (
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg>
              ) : (
                n
              )}
            </span>
            <span className="flow-label">
              {state === 'done' && <span className="sr-only">Klart: </span>}
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
