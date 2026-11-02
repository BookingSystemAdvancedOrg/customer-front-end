import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Bar } from './components/Bar'
import { meterTone } from './components/meterTone'
import { Button } from './components/Button'
import { Field, Input } from './components/Field'
import { Modal } from './components/Modal'
import { Select } from './components/Select'
import { Toaster } from './components/Toast'
import { toast } from './components/toastStore'
import { StatTile } from './components/StatTile'
import { Printing } from './components/Printing'
import { SkelCard, Skeleton } from './components/Skeleton'
import { BarChart, ColumnChart } from './components/Chart'
import { Card } from './components/Card'
import { Chip } from './components/Chip'
import { CountUp } from './react/CountUp'

describe('Bar', () => {
  it('progress: a named progressbar with its value', () => {
    render(<Bar variant="progress" value={0.5} label="Steg" valueText="3 / 6" size="hairline" />)
    const bar = screen.getByRole('progressbar', { name: 'Steg' })
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    expect(bar).toHaveAttribute('aria-valuetext', '3 / 6')
    expect(bar).toHaveClass('bq-bar', 'bq-bar--progress', 'bq-bar--hairline')
    expect(bar.style.getPropertyValue('--bq-bar-value')).toBe('0.500')
  })

  it('busy: phases and the live status text, hidden while idle', () => {
    const { container, rerender } = render(<Bar variant="busy" phase="idle" className="busy-bar" />)
    const root = container.firstElementChild!
    expect(root).toHaveClass('bq-bar--busy', 'bq-bar--sticky', 'bq-bar--is-idle', 'busy-bar')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    rerender(<Bar variant="busy" phase="busy" position="fixed" busyLabel="Loading" doneLabel="Done" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    rerender(<Bar variant="busy" phase="done" busyLabel="Loading" doneLabel="Done" />)
    expect(screen.getByRole('status')).toHaveTextContent('Done')
  })

  it('chart: label and value as text, share as the variable', () => {
    const { container } = render(<Bar variant="chart" label="Mån" value={30} max={120} valueText="30 st" />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveTextContent('Mån')
    expect(root).toHaveTextContent('30 st')
    expect(root.style.getPropertyValue('--bq-bar-value')).toBe('0.250')
  })

  it('meter: role meter, tone from low/high/optimum, ring shape', () => {
    render(<Bar variant="meter" value={0.9} low={0.3} high={0.8} optimum={0.1} label="Beläggning" valueText="90 %" shape="ring" />)
    const m = screen.getByRole('meter', { name: 'Beläggning' })
    expect(m).toHaveClass('bq-bar--ring', 'bq-bar--tone-danger')
    expect(meterTone({ value: 0.5, low: 0.3, high: 0.8, optimum: 0.5 })).toBe('success')
    expect(meterTone({ value: 0.9, low: 0.3, high: 0.8, optimum: 0.5 })).toBe('warning')
  })

  it('tab: a tablist with roving focus and arrow keys', async () => {
    function Tabs() {
      const [v, setV] = useState('a')
      return <Bar variant="tab" label="Vy" value={v} onChange={setV} items={[{ key: 'a', label: 'Dag' }, { key: 'b', label: 'Vecka' }, { key: 'c', label: 'Månad' }]} />
    }
    render(<Tabs />)
    const tabs = screen.getAllByRole('tab')
    expect(screen.getByRole('tablist', { name: 'Vy' })).toHaveAttribute('data-bq-glide', 'track')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    tabs[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Vecka' })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Vecka' }))
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Månad' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Dag' })).toHaveAttribute('aria-selected', 'true')
  })

  it('nav: a named navigation with the current page', () => {
    render(<Bar variant="nav" label="Huvudmeny" items={[{ key: 'h', label: 'Hem', href: '/', current: true }, { key: 'm', label: 'Meny', href: '/meny' }]} />)
    expect(screen.getByRole('navigation', { name: 'Huvudmeny' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hem' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Meny' })).not.toHaveAttribute('aria-current')
  })

  it('action and banner', async () => {
    const onDismiss = vi.fn()
    render(
      <>
        <Bar variant="action" label="Spara" status="Osparade ändringar" sticky>
          <Button variant="primary">Spara</Button>
        </Bar>
        <Bar variant="banner" tone="danger" onDismiss={onDismiss}>Kunde inte spara</Bar>
      </>,
    )
    expect(screen.getByRole('group', { name: 'Spara' })).toHaveClass('bq-bar--stuck')
    expect(screen.getByRole('alert')).toHaveTextContent('Kunde inte spara')
    await userEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('live: a polite status with the default Swedish text, the timer outside the live region', () => {
    const { container, rerender } = render(<Bar variant="live" detail="03:12" />)
    const root = container.firstElementChild!
    expect(root).toHaveClass('bq-bar', 'bq-bar--live', 'bq-bar--live-call')
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent(/^Pågående samtal$/)
    expect(root).toHaveTextContent('03:12')
    expect(root.querySelector('.bq-bar__dot')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Bar variant="live" kind="recording" />)
    expect(screen.getByRole('status')).toHaveTextContent('Spelas in')
    expect(container.firstElementChild).toHaveClass('bq-bar--live-recording')
    rerender(<Bar variant="live" kind="recording" label="Recording" />)
    expect(screen.getByRole('status')).toHaveTextContent('Recording')
  })
})

describe('components', () => {
  it('Button: busy is disabled, aria-busy and shows the busy label', () => {
    render(<Button variant="primary" busy busyLabel="Sparar…">Spara</Button>)
    const b = screen.getByRole('button', { name: 'Sparar…' })
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b).toHaveClass('bq-btn', 'bq-btn--primary', 'bq-btn--md')
  })

  it('Field: label, hint and error are wired to the control', () => {
    const { rerender } = render(<Field label="E-post" hint="Vi skickar kvittot hit"><Input type="email" /></Field>)
    const input = screen.getByLabelText('E-post')
    expect(input).toHaveAccessibleDescription('Vi skickar kvittot hit')
    rerender(<Field label="E-post" error="Fyll i en giltig e-post" required><Input type="email" /></Field>)
    expect(screen.getByLabelText(/E-post/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/E-post/)).toBeRequired()
    expect(screen.getByLabelText(/E-post/)).toHaveAccessibleDescription('Fyll i en giltig e-post')
  })

  it('Select is the native select', () => {
    render(<Field label="Ämne"><Select defaultValue="b"><option value="a">A</option><option value="b">B</option></Select></Field>)
    const s = screen.getByLabelText('Ämne') as HTMLSelectElement
    expect(s.tagName).toBe('SELECT')
    expect(s.value).toBe('b')
    expect(s).toHaveClass('bq-select')
  })

  it('Modal: a labelled dialog that closes on Escape and on the close button', async () => {
    const onClose = vi.fn()
    render(<Modal open title="Ta bort bokning" onClose={onClose}><p>Säker?</p></Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Ta bort bokning' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await userEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('Toast: shows a banner, leaves after its time, can be dismissed', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      toast('Sparat', { timeoutMs: 1000 })
    })
    expect(screen.getByRole('status')).toHaveTextContent('Sparat')
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(screen.queryByText('Sparat')).toBeNull()
    vi.useRealTimers()
  })

  it('StatTile, CountUp and Printing land on the final text (reduced motion)', () => {
    render(
      <>
        <StatTile label="Bokningar idag" value="1 250 kr" trend="good" delta="+12 %" />
        <CountUp>42</CountUp>
        <Printing label="Hämtar bokningar" />
      </>,
    )
    expect(screen.getByText('1 250 kr')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Hämtar bokningar…')
  })

  it('Skeleton is one status region with hidden blocks', () => {
    render(<Skeleton label="Hämtar menyn"><SkelCard /></Skeleton>)
    expect(screen.getByRole('status', { name: 'Hämtar menyn' })).toHaveAttribute('aria-busy', 'true')
  })

  it('charts are lists of chart Bars with text values', () => {
    render(
      <>
        <BarChart title="Populärast" data={[{ key: 'a', label: 'Pizza', value: 10, valueText: '10 st' }, { key: 'b', label: 'Sallad', value: 5 }]} />
        <ColumnChart title="Per dag" data={[]} />
        <Card title="Kort" surface="receipt"><p>Kvitto</p></Card>
      </>,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('10 st')).toBeInTheDocument()
    expect(screen.getByText('Ingen data än')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kort' }).closest('section')).toHaveClass('bq-card--receipt')
  })

  it('Chip: the status as text on its tone, the icon hidden', () => {
    render(
      <>
        <Chip tone="success" icon={<svg data-testid="ok" />}>Insläppt</Chip>
        <Chip>Avbokad</Chip>
      </>,
    )
    expect(screen.getByText('Insläppt')).toHaveClass('bq-chip', 'bq-chip--success')
    expect(screen.getByTestId('ok').parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Avbokad')).toHaveClass('bq-chip--neutral')
  })

  it('Card ticket: details, then the QR on its plate and the code in the stub', () => {
    render(
      <Card title="Jazzkväll" surface="ticket" qr={<svg aria-label="QR-kod" role="img" />} code="7K2F-91QA">
        <p>Fre 14 nov 19:00</p>
      </Card>,
    )
    const card = screen.getByRole('heading', { name: 'Jazzkväll' }).closest('section')!
    expect(card).toHaveClass('bq-card--ticket')
    expect(card.querySelector('.bq-card__main')).toHaveTextContent('Fre 14 nov 19:00')
    expect(screen.getByRole('img', { name: 'QR-kod' }).parentElement).toHaveClass('bq-card__qr')
    expect(screen.getByText('7K2F-91QA')).toHaveClass('bq-card__code')
    expect(card.lastElementChild).toHaveClass('bq-card__stub')
    const plain = render(<Card surface="ticket"><p>Utan kod</p></Card>).container.querySelector('section')!
    expect(plain.querySelector('.bq-card__main')).toHaveTextContent('Utan kod')
    expect(plain.querySelector('.bq-card__stub')).toBeNull()
  })
})
