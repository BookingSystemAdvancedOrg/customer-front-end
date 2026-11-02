import type { MeterBarProps } from './Bar'

/** good / warning / danger from the <meter> rules (low, high, optimum). */
export function meterTone({ value, min = 0, max = 1, low, high, optimum }: Pick<MeterBarProps, 'value' | 'min' | 'max' | 'low' | 'high' | 'optimum'>): 'success' | 'warning' | 'danger' {
  const lo = low ?? min
  const hi = high ?? max
  const region = (v: number) => (v < lo ? 0 : v > hi ? 2 : 1)
  const best = region(optimum ?? (min + max) / 2)
  const distance = Math.abs(region(value) - best)
  return distance === 0 ? 'success' : distance === 1 ? 'warning' : 'danger'
}
