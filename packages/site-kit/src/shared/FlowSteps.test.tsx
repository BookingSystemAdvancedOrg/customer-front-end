import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FlowSteps } from './FlowSteps'

const STEPS = [{ label: 'Tid' }, { label: 'Bord' }, { label: 'Uppgifter' }]

describe('FlowSteps', () => {
  it('marks the current step and ticks the ones before it', () => {
    render(<FlowSteps steps={STEPS} current={2} label="Bokning" />)
    const list = screen.getByRole('list', { name: 'Bokning: steg 2 av 3' })
    const items = screen.getAllByRole('listitem')
    expect(list).toBeInTheDocument()
    expect(items[0]).toHaveClass('is-done')
    expect(items[0]).toHaveTextContent('Klart: Tid')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[1]).toHaveTextContent('2Bord')
    expect(items[2]).toHaveClass('is-next')
    expect(items[2]).not.toHaveAttribute('aria-current')
  })

  it('ticks every step when the flow is done', () => {
    render(<FlowSteps steps={STEPS} current={1} done />)
    expect(screen.getByRole('list', { name: 'Steg: steg 3 av 3' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').every((li) => li.classList.contains('is-done'))).toBe(true)
    expect(screen.queryByText('1')).toBeNull()
  })
})
