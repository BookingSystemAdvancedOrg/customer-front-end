import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Options = Record<string, (arg?: string) => void> & { sitekey: string; action: string }

let rendered: Options | null = null
const api = {
  render: vi.fn((_el: HTMLElement, options: Options) => {
    rendered = options
    return 'widget-1'
  }),
  reset: vi.fn(),
  remove: vi.fn(),
}

beforeEach(() => {
  rendered = null
  api.render.mockClear()
  api.reset.mockClear()
  api.remove.mockClear()
})
afterEach(() => {
  delete window.turnstile
  vi.resetModules()
})

describe('TurnstileWidget', () => {
  it('renders the booking widget, passes tokens on, resets and removes it', async () => {
    window.turnstile = api
    const { TurnstileWidget } = await import('./TurnstileWidget')
    const onToken = vi.fn()
    const { rerender, unmount } = render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} />)
    await act(async () => {})

    expect(api.render).toHaveBeenCalledTimes(1)
    expect(rendered).toMatchObject({ sitekey: 'site-key', action: 'booking', language: 'sv' })
    rendered!.callback('tok-1')
    expect(onToken).toHaveBeenLastCalledWith('tok-1')
    rendered!['expired-callback']()
    expect(onToken).toHaveBeenLastCalledWith(null)

    rerender(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} />)
    expect(api.reset).not.toHaveBeenCalled()
    rerender(<TurnstileWidget siteKey="site-key" resetKey={1} onToken={onToken} />)
    expect(api.reset).toHaveBeenCalledWith('widget-1')

    unmount()
    expect(api.remove).toHaveBeenCalledWith('widget-1')
    expect(onToken).toHaveBeenLastCalledWith(null)
  })

  it('says so when the widget cannot be shown', async () => {
    window.turnstile = { ...api, render: vi.fn(() => { throw new Error('invalid sitekey') }) }
    const { TurnstileWidget } = await import('./TurnstileWidget')
    render(<TurnstileWidget siteKey="bad-key" resetKey={0} onToken={() => {}} />)
    await act(async () => {})
    expect(screen.getByRole('alert')).toHaveTextContent('Säkerhetskontrollen kunde inte laddas')
  })

  it('says so when the check cannot be loaded', async () => {
    const { TurnstileWidget } = await import('./TurnstileWidget')
    render(<TurnstileWidget siteKey="site-key" resetKey={0} onToken={() => {}} />)
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')!
    expect(script.src).toContain('render=explicit')
    await act(async () => {
      script.onerror?.(new Event('error'))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Säkerhetskontrollen kunde inte laddas')
    expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull()
  })
})
