import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DateInput, formatDate, parseDate } from './DateInput'

function Harness() {
  const [value, setValue] = useState('')
  return (
    <div className="catering-details" style={{ transform: 'translateY(0)' }}>
      <label htmlFor="d">Datum</label>
      <DateInput id="d" value={value} min="2026-11-01" onChange={(e) => setValue(e.target.value)} />
      <output data-testid="value">{value}</output>
    </div>
  )
}

describe('DateInput', () => {
  it('parses and formats Swedish dates', () => {
    expect(parseDate('22/10/2026')).toBe('2026-10-22')
    expect(parseDate('31/02/2026')).toBeNull()
    expect(formatDate('2026-10-22')).toBe('22/10/2026')
  })

  it('opens the calendar in body, outside a transformed card, and picks a day', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna kalender' }))
    const cal = screen.getByRole('dialog', { name: 'Välj datum' })
    // a transformed ancestor would become the containing block of position: fixed
    expect(cal.parentElement).toBe(document.body)
    expect(cal.closest('.catering-details')).toBeNull()
    fireEvent.click(cal.querySelector<HTMLButtonElement>('.date-cal-day:not(:disabled)')!)
    expect(screen.queryByRole('dialog', { name: 'Välj datum' })).not.toBeInTheDocument()
    expect(screen.getByTestId('value').textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('moves focus to a day and closes on Escape', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna kalender' }))
    const cal = screen.getByRole('dialog', { name: 'Välj datum' })
    expect(document.activeElement).toHaveClass('date-cal-day')
    fireEvent.keyDown(cal, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Välj datum' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Öppna kalender' })).toHaveFocus()
  })

  it('stays inside an open dialog so the top layer shows it', () => {
    render(
      <dialog open>
        <Harness />
      </dialog>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Öppna kalender' }))
    expect(screen.getByRole('dialog', { name: 'Välj datum' }).parentElement?.tagName).toBe('DIALOG')
  })
})
