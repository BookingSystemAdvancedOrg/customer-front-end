import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FloorPlan3D } from './FloorPlan3D'
import type { FloorGroup } from '../../shared/layoutApi'

const GROUP: FloorGroup = {
  floor: null,
  elements: [
    { elementId: 't1', type: 'table', x: 1, y: 0, z: 1, width: 1, height: 0.75, depth: 1, rotationY: 0, shape: 'rect', seats: 4, zone: 'main' },
    { elementId: 't2', type: 'table', x: 3, y: 0, z: 1, width: 1, height: 0.75, depth: 1, rotationY: 0, shape: 'round', seats: 2, zone: 'main' },
  ],
}

function setup() {
  const onToggle = vi.fn()
  const onExplain = vi.fn()
  render(
    <FloorPlan3D
      group={GROUP}
      free={new Map([['t1', 4]])}
      selected={new Set()}
      onToggle={onToggle}
      unavailable={new Map([['t2', { tableId: 't2', reason: 'booked' as const }]])}
      onExplain={onExplain}
    />,
  )
  return { onToggle, onExplain }
}

const spin = () => document.querySelector<HTMLElement>('.f3d-world')!.style.getPropertyValue('--spin')

describe('FloorPlan3D - table choice', () => {
  it('picks a free table and explains a booked one, like the 2D plan', () => {
    const { onToggle, onExplain } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^Bord 1, 4 platser, ledigt$/ }))
    expect(onToggle).toHaveBeenCalledWith('t1')
    fireEvent.click(screen.getByRole('button', { name: /^Bord 2, 2 platser, går inte att välja/ }))
    expect(onExplain).toHaveBeenCalledWith('t2')
  })

  it('a drag rotates the view and does not pick the table it started on', () => {
    const { onToggle } = setup()
    const table = screen.getByRole('button', { name: /^Bord 1/ })
    const before = parseFloat(spin())
    fireEvent.pointerDown(table, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(table, { clientX: 160, pointerId: 1 })
    fireEvent.pointerUp(table, { clientX: 160, pointerId: 1 })
    fireEvent.click(table)
    expect(onToggle).not.toHaveBeenCalled()
    // Dragging right turns the near side of the room to the right (spin goes down).
    expect(parseFloat(spin())).toBeLessThan(before)
  })

  it('a few pixels of jitter still counts as a tap', () => {
    const { onToggle } = setup()
    const table = screen.getByRole('button', { name: /^Bord 1/ })
    fireEvent.pointerDown(table, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(table, { clientX: 103, pointerId: 1 })
    fireEvent.pointerUp(table, { clientX: 103, pointerId: 1 })
    fireEvent.click(table)
    expect(onToggle).toHaveBeenCalledWith('t1')
  })
})
