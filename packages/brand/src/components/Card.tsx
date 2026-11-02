import type { ReactNode } from 'react'

export interface CardProps {
  title?: ReactNode
  /** Heading level of the title (default h2). */
  level?: 2 | 3 | 4
  actions?: ReactNode
  children: ReactNode
  /**
   * glass: a panel on the room; paper: a white card; receipt: a ticket with rail, torn edge and mono print;
   * ticket: an event ticket stub with mono details, a perforation and the QR stub (follows the theme).
   */
  surface?: 'glass' | 'paper' | 'receipt' | 'ticket'
  tone?: 'danger'
  /** ticket: the QR code (an <svg> or <img>), shown on a white plate with a quiet zone in both modes. */
  qr?: ReactNode
  /** ticket: the code under the QR, in mono, for typing at the door. */
  code?: ReactNode
  className?: string
}

export function Card({ title, level = 2, actions, children, surface = 'paper', tone, qr, code, className }: CardProps) {
  const H = `h${level}` as 'h2'
  const content = (
    <>
      {(title || actions) && (
        <header className="bq-card__head">
          {title && <H className="bq-card__title">{title}</H>}
          {actions && <div className="bq-card__actions">{actions}</div>}
        </header>
      )}
      <div className="bq-card__body">{children}</div>
    </>
  )
  return (
    <section className={['bq-card', `bq-card--${surface}`, tone && `bq-card--${tone}`, className].filter(Boolean).join(' ')}>
      {surface === 'ticket' ? (
        <>
          <div className="bq-card__main">{content}</div>
          {(qr || code) && (
            <div className="bq-card__stub">
              {qr && <div className="bq-card__qr">{qr}</div>}
              {code && <span className="bq-card__code">{code}</span>}
            </div>
          )}
        </>
      ) : (
        content
      )}
    </section>
  )
}
