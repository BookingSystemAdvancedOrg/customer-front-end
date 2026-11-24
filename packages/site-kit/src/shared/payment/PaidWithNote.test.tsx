import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaidWithNote } from './PaidWithNote'

describe('PaidWithNote', () => {
  it('a plain card is one text node, so the page translator sees the whole phrase', () => {
    const { container } = render(<PaidWithNote paidWith={{ method: 'card' }} />)
    const p = container.querySelector('p.paid-with')!
    expect(p.childNodes).toHaveLength(1)
    expect(p.textContent).toBe('Betald med kort')
  })

  it('a proper name stays untranslated', () => {
    const { container } = render(<PaidWithNote paidWith={{ method: 'card', brand: 'visa', last4: '4242' }} />)
    expect(container.querySelector('span[translate="no"]')?.textContent).toBe('Visa ****4242')
    expect(container.textContent).toBe('Betald med Visa ****4242')
  })

  it('nothing without a known method', () => {
    const { container } = render(<PaidWithNote paidWith={null} />)
    expect(container.textContent).toBe('')
  })
})
