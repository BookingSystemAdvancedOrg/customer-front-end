import type { ReactNode } from 'react'

export interface CardProps {
  title?: ReactNode
  /** Heading level of the title (default h2). */
  level?: 2 | 3 | 4
  actions?: ReactNode
  children: ReactNode
  /** glass: a panel on the room; paper: a white card; receipt: a ticket with rail, torn edge and mono print. */
  surface?: 'glass' | 'paper' | 'receipt'
  tone?: 'danger'
  className?: string
}

export function Card({ title, level = 2, actions, children, surface = 'paper', tone, className }: CardProps) {
  const H = `h${level}` as 'h2'
  return (
    <section className={['bq-card', `bq-card--${surface}`, tone && `bq-card--${tone}`, className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <header className="bq-card__head">
          {title && <H className="bq-card__title">{title}</H>}
          {actions && <div className="bq-card__actions">{actions}</div>}
        </header>
      )}
      <div className="bq-card__body">{children}</div>
    </section>
  )
}
