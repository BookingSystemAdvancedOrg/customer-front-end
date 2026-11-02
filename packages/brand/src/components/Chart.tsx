import type { ReactNode } from 'react'
import { Bar } from './Bar'
import type { ChartTone } from './Bar'

/**
 * Chart wrappers built from chart Bars, so every chart bar in every app is
 * the same element. Each bar carries its label and value as text, so the
 * chart reads as a list for screen readers and colour is never the only
 * signal. Charts with lines or areas stay SVG for now (see DESIGN.md).
 */
export interface ChartDatum {
  key: string
  label: string
  value: number
  valueText?: string
  tone?: ChartTone
}

interface ChartProps {
  title: ReactNode
  data: ChartDatum[]
  /** Scale top (default: the largest value). */
  max?: number
  empty?: ReactNode
  className?: string
}

function scaleMax(data: ChartDatum[], max?: number) {
  return max ?? Math.max(0, ...data.map((d) => d.value))
}

/** Horizontal bars, one row per item: rankings, shares, top lists. */
export function BarChart({ title, data, max, empty = 'Ingen data än', className }: ChartProps) {
  const top = scaleMax(data, max)
  return (
    <figure className={['bq-chart bq-chart--rows', className].filter(Boolean).join(' ')}>
      <figcaption className="bq-chart__title">{title}</figcaption>
      {data.length === 0 ? (
        <p className="bq-chart__empty">{empty}</p>
      ) : (
        <ul className="bq-chart__list">
          {data.map((d) => (
            <li key={d.key}>
              <Bar variant="chart" label={d.label} value={d.value} max={top} valueText={d.valueText} tone={d.tone} />
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

/** Vertical columns along a time axis: days, weeks, months. */
export function ColumnChart({ title, data, max, empty = 'Ingen data än', className }: ChartProps) {
  const top = scaleMax(data, max)
  return (
    <figure className={['bq-chart bq-chart--columns', className].filter(Boolean).join(' ')}>
      <figcaption className="bq-chart__title">{title}</figcaption>
      {data.length === 0 ? (
        <p className="bq-chart__empty">{empty}</p>
      ) : (
        <ul className="bq-chart__list">
          {data.map((d) => (
            <li key={d.key}>
              <Bar variant="chart" orientation="vertical" label={d.label} value={d.value} max={top} valueText={d.valueText} tone={d.tone} />
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
