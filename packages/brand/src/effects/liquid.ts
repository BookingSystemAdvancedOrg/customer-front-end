import { easeOutCubic, reducedMotion } from './motion'

/**
 * Liquid fill: a simple but real water surface. The surface is a row of
 * columns, each a spring (Hooke) toward rest, and neighbours pull on each
 * other so waves spread and ebb out (the classic 2D game water). The pouring
 * jet pushes the surface down where it lands and the splash is small drops
 * with gravity. Used by StatTile and the admin sidebar pour.
 */
export interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

export class Liquid {
  /** Offset from rest per column (px, positive = down). */
  y: Float32Array
  v: Float32Array
  drops: Drop[] = []
  private left: Float32Array
  private right: Float32Array
  readonly columns: number

  constructor(columns: number) {
    this.columns = columns
    this.y = new Float32Array(columns)
    this.v = new Float32Array(columns)
    this.left = new Float32Array(columns)
    this.right = new Float32Array(columns)
  }

  /** One time step (~16 ms). */
  step(): void {
    const { y, v, left, right } = this
    const n = y.length
    const tension = 0.022
    const damping = 0.035
    const spread = 0.14
    for (let i = 0; i < n; i++) {
      v[i] += -tension * y[i] - damping * v[i]
      y[i] += v[i]
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        left[i] = i > 0 ? spread * (y[i] - y[i - 1]) : 0
        right[i] = i < n - 1 ? spread * (y[i] - y[i + 1]) : 0
      }
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          v[i - 1] += left[i]
          y[i - 1] += left[i]
        }
        if (i < n - 1) {
          v[i + 1] += right[i]
          y[i + 1] += right[i]
        }
      }
    }
    for (const d of this.drops) {
      d.vy += 0.55
      d.x += d.vx
      d.y += d.vy
    }
  }

  /** Push the surface down (or up, negative) at a column. */
  push(column: number, force: number): void {
    const i = Math.max(0, Math.min(this.y.length - 1, Math.round(column)))
    this.v[i] += force
  }

  /** Motion left; near zero = the surface lies still. */
  energy(): number {
    let e = 0
    for (let i = 0; i < this.y.length; i++) e += this.y[i] * this.y[i] + this.v[i] * this.v[i]
    return e
  }
}

export interface PourOptions {
  /** Delay before the jet starts (stagger in a row of tiles). */
  delayMs?: number
  fillMs?: number
  /** Where the jet lands, as a share of the width. */
  pourAt?: number
  onDone?: () => void
}

export interface PourHandle {
  /** Touch the surface at x (0..1) with a force; wakes the loop. */
  touch: (x: number, force: number) => void
  stop: () => void
}

const COLUMNS = 48
export const FILL_MS = 1500

/**
 * Fills `host` with liquid drawn on `canvas` (behind the content). The colour
 * comes from --bq-liquid (rgb triple) and --bq-liquid-alpha on the host;
 * --bq-liquid-edge colours the surface line where the liquid is opaque.
 * Without a 2D context or with reduced motion the host gets
 * .bq-liquid--full at once and nothing moves.
 */
export function pourLiquid(host: HTMLElement, canvas: HTMLCanvasElement, { delayMs = 0, fillMs = FILL_MS, pourAt = 0.18, onDone }: PourOptions = {}): PourHandle {
  const ctx = reducedMotion() || typeof requestAnimationFrame !== 'function' ? null : (canvas.getContext?.('2d') ?? null)
  if (!ctx) {
    host.classList.add('bq-liquid--full')
    onDone?.()
    return { touch: () => {}, stop: () => {} }
  }
  const liquid = new Liquid(COLUMNS)
  const styles = getComputedStyle(host)
  const color = styles.getPropertyValue('--bq-liquid').trim() || '255, 255, 255'
  const alpha = Number(styles.getPropertyValue('--bq-liquid-alpha')) || 0.4
  const edge = styles.getPropertyValue('--bq-liquid-edge').trim() || color
  const edgeAlpha = Math.min(1, alpha * 4)

  let width = 1
  let height = 1
  const resize = () => {
    const rect = host.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    width = Math.max(1, Math.round(rect.width))
    height = Math.max(1, Math.round(rect.height))
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
  ro?.observe(host)

  const start = performance.now() + delayMs
  let raf = 0
  let running = true
  let settled = 0
  let lastPour = 0
  let finished = false
  const surfaceAt = (level: number, i: number) => height - level + liquid.y[i]

  const draw = (level: number, pouring: boolean, t: number) => {
    ctx.clearRect(0, 0, width, height)
    const colW = width / (COLUMNS - 1)
    // a back layer, slightly out of phase: depth for the surface
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let i = 0; i < COLUMNS; i++) ctx.lineTo(i * colW, height - level + liquid.y[Math.min(COLUMNS - 1, i + 3)] * 0.7 - 3)
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fillStyle = `rgba(${color}, ${alpha * 0.55})`
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let i = 0; i < COLUMNS; i++) ctx.lineTo(i * colW, surfaceAt(level, i))
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fillStyle = `rgba(${color}, ${alpha})`
    ctx.fill()
    ctx.beginPath()
    for (let i = 0; i < COLUMNS; i++) {
      if (i === 0) ctx.moveTo(0, surfaceAt(level, 0))
      else ctx.lineTo(i * colW, surfaceAt(level, i))
    }
    ctx.strokeStyle = `rgba(${edge}, ${edgeAlpha})`
    ctx.lineWidth = 1.5
    ctx.stroke()
    if (pouring) {
      const x = width * pourAt + Math.sin(t / 90) * 1.2
      const hit = surfaceAt(level, Math.round(pourAt * (COLUMNS - 1)))
      const w = 3 + Math.sin(t / 140) * 0.6
      ctx.beginPath()
      ctx.moveTo(x - w, 0)
      ctx.quadraticCurveTo(x - w * 0.6, hit * 0.5, x - w * 0.45, hit)
      ctx.lineTo(x + w * 0.45, hit)
      ctx.quadraticCurveTo(x + w * 0.6, hit * 0.5, x + w, 0)
      ctx.closePath()
      ctx.fillStyle = `rgba(${edge}, ${Math.min(1, alpha * 5)})`
      ctx.fill()
    }
    ctx.fillStyle = `rgba(${edge}, ${Math.min(1, alpha * 4.5)})`
    for (const d of liquid.drops) {
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const frame = (now: number) => {
    if (!running) return
    const t = Math.max(0, now - start)
    const level = easeOutCubic(t / fillMs) * height
    const pouring = t > 0 && t < fillMs * 0.82
    if (pouring) {
      liquid.push(pourAt * (COLUMNS - 1), 0.9 + Math.random() * 0.5)
      if (now - lastPour > 70 && Math.random() < 0.6) {
        lastPour = now
        liquid.drops.push({ x: width * pourAt + (Math.random() - 0.5) * 6, y: height - level, vx: (Math.random() - 0.5) * 3.2, vy: -(2.5 + Math.random() * 3), r: 1 + Math.random() * 1.6 })
      }
    }
    liquid.step()
    liquid.drops = liquid.drops.filter((d) => {
      if (d.y >= height - level + liquid.y[Math.round((d.x / width) * (COLUMNS - 1))] && d.vy > 0) {
        liquid.push((d.x / width) * (COLUMNS - 1), 0.6)
        return false
      }
      return d.y < height + 10 && d.x > -10 && d.x < width + 10
    })
    const done = t >= fillMs
    if (done && !finished) {
      finished = true
      onDone?.()
    }
    draw(level, pouring, now)
    if (done) settled = liquid.energy() < 0.02 && liquid.drops.length === 0 ? settled + 1 : 0
    if (done && settled > 20) {
      draw(height, false, now)
      raf = 0
      return
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return {
    touch: (x, force) => {
      liquid.push(x * (COLUMNS - 1), force)
      if (!raf && running) raf = requestAnimationFrame(frame)
    },
    stop: () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      ro?.disconnect()
    },
  }
}
