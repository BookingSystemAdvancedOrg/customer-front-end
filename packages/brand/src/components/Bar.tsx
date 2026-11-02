import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ElementType, KeyboardEvent, ReactNode } from 'react'
import { installGlide } from '../effects/glide'
import { meterTone } from './meterTone'

/**
 * The Bar family: every bar-like element in every Booqy app is one of these
 * variants, never hand-rolled. All share the .bq-bar root class, tokens and
 * motion; see docs/design/DESIGN.md for when to use each.
 *
 *  progress  determinate progress (steps, upload, hold timer)
 *  busy      the strip at the top while work runs
 *  chart     one bar in a bar or column chart (BarChart, ColumnChart)
 *  meter     a measured value in a known range, as a line or a ring
 *  tab       a tab bar (tablist) with the glide pill
 *  nav       a navigation bar (top nav, sidebar) with the glide pill
 *  action    the submit or action bar under a form
 *  banner    a message shown as a bar (inline notice; Toast uses it)
 *  live      a live indicator: a call in progress or a recording (pulsing dot)
 */
export type Tone = 'info' | 'success' | 'warning' | 'danger'
export type ChartTone = 'ink' | 'tan' | 'bronze' | 'danger'

interface Common {
  className?: string
  id?: string
}

export interface ProgressBarProps extends Common {
  variant: 'progress'
  /** 0..1 */
  value: number
  /** Accessible name ("Steg", "Uppladdning"). */
  label: string
  /** Visible value text, also read out ("3 / 6", "40 %"). */
  valueText?: string
  size?: 'hairline' | 'thin' | 'regular'
}

export interface BusyBarProps extends Common {
  variant: 'busy'
  phase: 'idle' | 'busy' | 'done'
  /** sticky in the page flow (admin) or fixed to the viewport (console). */
  position?: 'sticky' | 'fixed'
  busyLabel?: string
  doneLabel?: string
}

export interface ChartBarProps extends Common {
  variant: 'chart'
  value: number
  max: number
  label: string
  valueText?: string
  tone?: ChartTone
  orientation?: 'horizontal' | 'vertical'
}

export interface MeterBarProps extends Common {
  variant: 'meter'
  value: number
  min?: number
  max?: number
  /** As on <meter>: below low or above high is outside the good range. */
  low?: number
  high?: number
  optimum?: number
  label: string
  valueText?: string
  shape?: 'line' | 'ring'
}

export interface TabItem {
  key: string
  label: ReactNode
  disabled?: boolean
}

export interface TabBarProps extends Common {
  variant: 'tab'
  label: string
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  /** track: sand track and pill (segmented choice); bare: the pill only. */
  kind?: 'track' | 'bare'
  /** Id of the panel each tab controls. */
  panelId?: (key: string) => string
}

export interface NavItem {
  key: string
  label: ReactNode
  href: string
  current?: boolean
}

export interface NavBarProps extends Common {
  variant: 'nav'
  label: string
  items: NavItem[]
  orientation?: 'horizontal' | 'vertical'
  /** A router link (react-router Link) instead of <a>; gets href as `to` too. */
  linkAs?: ElementType
}

export interface ActionBarProps extends Common {
  variant: 'action'
  children: ReactNode
  /** Status text beside the actions ("Osparade ändringar"). */
  status?: ReactNode
  sticky?: boolean
  label?: string
}

export interface BannerBarProps extends Common {
  variant: 'banner'
  tone?: Tone
  children: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
}

export interface LiveBarProps extends Common {
  variant: 'live'
  /** call: a call in progress (green dot); recording: being recorded (red dot). */
  kind?: 'call' | 'recording'
  /** Status text, read out politely when it changes. Default "Pågående samtal" / "Spelas in". */
  label?: string
  /** Detail beside the label, such as the elapsed time ("03:12"); outside the live region so ticks are not read out. */
  detail?: ReactNode
}

export type BarProps = ProgressBarProps | BusyBarProps | ChartBarProps | MeterBarProps | TabBarProps | NavBarProps | ActionBarProps | BannerBarProps | LiveBarProps

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')
const valueStyle = (v: number) => ({ '--bq-bar-value': clamp01(v).toFixed(3) }) as CSSProperties

export function Bar(props: BarProps) {
  switch (props.variant) {
    case 'progress':
      return <ProgressBar {...props} />
    case 'busy':
      return <BusyStrip {...props} />
    case 'chart':
      return <ChartBar {...props} />
    case 'meter':
      return <MeterBar {...props} />
    case 'tab':
      return <TabBar {...props} />
    case 'nav':
      return <NavBar {...props} />
    case 'action':
      return <ActionBar {...props} />
    case 'banner':
      return <BannerBar {...props} />
    case 'live':
      return <LiveBar {...props} />
  }
}

function ProgressBar({ value, label, valueText, size = 'thin', className, id }: ProgressBarProps) {
  const v = clamp01(value)
  return (
    <div
      id={id}
      className={cx('bq-bar bq-bar--progress', `bq-bar--${size}`, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-valuetext={valueText}
      style={valueStyle(v)}
    >
      <span className="bq-bar__track">
        <span className="bq-bar__fill" />
      </span>
      {valueText && (
        <span className="bq-bar__value" aria-hidden="true">
          {valueText}
        </span>
      )}
    </div>
  )
}

function BusyStrip({ phase, position = 'sticky', busyLabel = 'Sparar…', doneLabel = 'Sparat', className, id }: BusyBarProps) {
  return (
    <div id={id} className={cx('bq-bar bq-bar--busy', `bq-bar--${position}`, `bq-bar--is-${phase}`, className)} aria-hidden={phase === 'idle'}>
      <div className="bq-bar__fill">
        <span className="bq-bar__wave" />
      </div>
      <span className="bq-sr-only" role="status" aria-live="polite">
        {phase === 'busy' ? busyLabel : phase === 'done' ? doneLabel : ''}
      </span>
    </div>
  )
}

function ChartBar({ value, max, label, valueText, tone = 'ink', orientation = 'horizontal', className, id }: ChartBarProps) {
  const share = max > 0 ? value / max : 0
  return (
    <div id={id} className={cx('bq-bar bq-bar--chart', orientation === 'vertical' ? 'bq-bar--column' : 'bq-bar--row', `bq-bar--tone-${tone}`, className)} style={valueStyle(share)}>
      <span className="bq-bar__label">{label}</span>
      <span className="bq-bar__track" aria-hidden="true">
        <span className="bq-bar__fill" />
      </span>
      <span className="bq-bar__value">{valueText ?? String(value)}</span>
    </div>
  )
}

const RING = 2 * Math.PI * 42

function MeterBar(props: MeterBarProps) {
  const { value, min = 0, max = 1, label, valueText, shape = 'line', className, id } = props
  const share = max > min ? (value - min) / (max - min) : 0
  const tone = meterTone(props)
  const common = {
    id,
    role: 'meter',
    'aria-label': label,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': value,
    'aria-valuetext': valueText,
    style: valueStyle(share),
  }
  if (shape === 'ring') {
    return (
      <div {...common} className={cx('bq-bar bq-bar--meter bq-bar--ring', `bq-bar--tone-${tone}`, className)}>
        <svg viewBox="0 0 100 100" aria-hidden="true" className="bq-bar__ring">
          <circle cx="50" cy="50" r="42" className="bq-bar__track" />
          <circle cx="50" cy="50" r="42" className="bq-bar__fill" strokeDasharray={`${RING * clamp01(share)} ${RING}`} transform="rotate(-90 50 50)" />
        </svg>
        <span className="bq-bar__value" aria-hidden="true">
          {valueText ?? String(value)}
        </span>
      </div>
    )
  }
  return (
    <div {...common} className={cx('bq-bar bq-bar--meter', `bq-bar--tone-${tone}`, className)}>
      <span className="bq-bar__track" aria-hidden="true">
        <span className="bq-bar__fill" />
      </span>
      {valueText && (
        <span className="bq-bar__value" aria-hidden="true">
          {valueText}
        </span>
      )}
    </div>
  )
}

function TabBar({ label, items, value, onChange, kind = 'track', panelId, className, id }: TabBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const base = useId()
  useEffect(installGlide, [])
  const enabled = items.filter((i) => !i.disabled)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = enabled.findIndex((i) => i.key === value)
    const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: enabled.length - 1 }[e.key]
    if (next === undefined || !enabled.length) return
    e.preventDefault()
    const item = enabled[(next + enabled.length) % enabled.length]
    onChange(item.key)
    ref.current?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(item.key)}"]`)?.focus()
  }
  return (
    <div ref={ref} id={id} className={cx('bq-bar bq-bar--tab', className)} role="tablist" aria-label={label} data-bq-glide={kind} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${base}-${item.key}`}
            data-key={item.key}
            aria-selected={selected}
            aria-controls={panelId?.(item.key)}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            className="bq-bar__item"
            onClick={() => onChange(item.key)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function NavBar({ label, items, orientation = 'horizontal', linkAs, className, id }: NavBarProps) {
  useEffect(installGlide, [])
  const Link = linkAs ?? 'a'
  return (
    <nav id={id} className={cx('bq-bar bq-bar--nav', `bq-bar--${orientation}`, className)} aria-label={label}>
      <ul className="bq-bar__items" data-bq-glide="bare">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} to={linkAs ? item.href : undefined} className="bq-bar__item" aria-current={item.current ? 'page' : undefined}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function ActionBar({ children, status, sticky = false, label, className, id }: ActionBarProps) {
  return (
    <div id={id} className={cx('bq-bar bq-bar--action', sticky && 'bq-bar--stuck', className)} role={label ? 'group' : undefined} aria-label={label}>
      {status && <span className="bq-bar__status">{status}</span>}
      <span className="bq-bar__actions">{children}</span>
    </div>
  )
}

function BannerBar({ tone = 'info', children, action, onDismiss, dismissLabel = 'Stäng', className, id }: BannerBarProps) {
  return (
    <div id={id} className={cx('bq-bar bq-bar--banner', `bq-bar--tone-${tone}`, className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="bq-bar__message">{children}</span>
      {action && <span className="bq-bar__actions">{action}</span>}
      {onDismiss && (
        <button type="button" className="bq-bar__dismiss" aria-label={dismissLabel} onClick={onDismiss}>
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  )
}

const LIVE_LABEL = { call: 'Pågående samtal', recording: 'Spelas in' }

function LiveBar({ kind = 'call', label = LIVE_LABEL[kind], detail, className, id }: LiveBarProps) {
  return (
    <div id={id} className={cx('bq-bar bq-bar--live', `bq-bar--live-${kind}`, className)}>
      <span className="bq-bar__dot" aria-hidden="true" />
      <span className="bq-bar__label" role="status" aria-live="polite">
        {label}
      </span>
      {detail && <span className="bq-bar__value">{detail}</span>}
    </div>
  )
}
