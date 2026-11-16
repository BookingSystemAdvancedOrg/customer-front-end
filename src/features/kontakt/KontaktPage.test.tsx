import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WithSite } from '@booqy/site-kit/testing'
import KontaktPage from './KontaktPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KontaktPage', () => {
  it('opens the mail draft and then shows the address to copy in case nothing opened', async () => {
    const user = userEvent.setup()
    const assign = { href: '' }
    vi.stubGlobal('location', assign)
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<WithSite><KontaktPage /></WithSite>)

    expect(screen.queryByText(/Vi återkommer/)).toBeNull()
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.click(screen.getByRole('combobox', { name: 'Ämne' }))
    await user.click(screen.getByRole('option', { name: 'Övrigt' }))
    await user.type(screen.getByLabelText('Meddelande'), 'Hej')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await user.click(screen.getByRole('button', { name: 'Öppna i e-postprogrammet' }))

    expect(assign.href).toMatch(/^mailto:city@testkrogen\.se\?subject=/)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Öppnades inget? Mejla oss på city@testkrogen.se.')
    await user.click(screen.getByRole('button', { name: 'Kopiera adressen' }))
    expect(writeText).toHaveBeenCalledWith('city@testkrogen.se')
    expect(await screen.findByRole('button', { name: 'Adressen är kopierad' })).toBeInTheDocument()
  })

  async function openDraft(user: ReturnType<typeof userEvent.setup>) {
    vi.stubGlobal('location', { href: '' })
    render(<WithSite><KontaktPage /></WithSite>)
    await user.type(screen.getByLabelText('Namn'), 'Anna')
    await user.type(screen.getByLabelText('E-post'), 'anna@example.se')
    await user.click(screen.getByRole('combobox', { name: 'Ämne' }))
    await user.click(screen.getByRole('option', { name: 'Övrigt' }))
    await user.type(screen.getByLabelText('Meddelande'), 'Hej')
    await user.click(screen.getByRole('button', { name: 'Öppna i e-postprogrammet' }))
  }

  it('tells the guest to copy the address by hand when copying is refused', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => { throw new Error('denied') })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await openDraft(user)

    await user.click(screen.getByRole('button', { name: 'Kopiera adressen' }))
    expect(writeText).toHaveBeenCalled()
    expect(await screen.findByText(/Kunde inte kopiera\. Markera adressen och kopiera den själv\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kopiera adressen' })).toBeInTheDocument()
  })

  it('tells the guest to copy the address by hand when there is no clipboard', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    await openDraft(user)

    await user.click(screen.getByRole('button', { name: 'Kopiera adressen' }))
    expect(screen.getByRole('status')).toHaveTextContent('Kunde inte kopiera. Markera adressen och kopiera den själv.')
  })
})
