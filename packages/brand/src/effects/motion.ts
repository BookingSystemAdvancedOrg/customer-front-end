/** The visitor asked for as little motion as possible. */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Fast start, calm landing. */
export function easeOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t))
  return 1 - (1 - u) ** 3
}

/** Rushes off and slows down the closer it gets: a number that lands. The last frame is exactly 1. */
export function easeOutExpo(t: number): number {
  const u = Math.min(1, Math.max(0, t))
  return u >= 1 ? 1 : 1 - 2 ** (-10 * u)
}
