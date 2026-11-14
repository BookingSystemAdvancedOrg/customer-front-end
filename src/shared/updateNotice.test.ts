import { afterEach, describe, expect, it, vi } from 'vitest'
import { startUpdateNotice } from './updateNotice'

function headWith(etags: string[]) {
  let i = 0
  return vi.fn(async () => {
    const etag = etags[Math.min(i++, etags.length - 1)]
    return new Response(null, { status: 200, headers: { etag } })
  })
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('updateNotice', () => {
  let stop: (() => void) | undefined
  afterEach(() => {
    stop?.()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('stays quiet while the version is unchanged', async () => {
    vi.stubGlobal('fetch', headWith(['"a"', '"a"']))
    stop = startUpdateNotice({ intervalMs: 10 })
    await flush()
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(document.querySelector('.booqy-update')).toBeNull()
  })

  it('shows Ladda om when index.html changes, and never reloads by itself', async () => {
    const fetchMock = headWith(['"a"', '"b"'])
    vi.stubGlobal('fetch', fetchMock)
    stop = startUpdateNotice({ intervalMs: 60_000 })
    await flush()
    window.dispatchEvent(new Event('focus'))
    await flush()
    const box = document.querySelector('.booqy-update')
    expect(box?.textContent).toContain('Ny version finns')
    expect(box?.querySelector('button')?.textContent).toBe('Ladda om')
    expect(fetchMock).toHaveBeenCalledWith('/index.html', expect.objectContaining({ method: 'HEAD', cache: 'no-store' }))
  })

  it('"Inte nu" hides it until the next new version', async () => {
    vi.stubGlobal('fetch', headWith(['"a"', '"b"', '"b"', '"c"']))
    stop = startUpdateNotice({ intervalMs: 60_000 })
    await flush()
    window.dispatchEvent(new Event('focus'))
    await flush()
    document.querySelector<HTMLButtonElement>('.booqy-update__close')!.click()
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(document.querySelector('.booqy-update')).toBeNull()
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(document.querySelector('.booqy-update')).not.toBeNull()
  })
  it('combines several files, so a css-only deploy also counts', async () => {
    let round = 0
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      const etag = u.endsWith('.css') && round > 0 ? '"css2"' : `"${u}"`
      return new Response(null, { status: 200, headers: { etag } })
    }))
    stop = startUpdateNotice({ url: ['/', '/assets/booqy.css'], intervalMs: 60_000 })
    await flush()
    round = 1
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(document.querySelector('.booqy-update')).not.toBeNull()
  })
  it('gives up on a hanging version check, so the next check still runs', async () => {
    vi.useFakeTimers()
    let call = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      call++
      if (call === 1) return Promise.resolve(new Response(null, { headers: { etag: '"a"' } }))
      if (call === 2) return new Promise<Response>(() => {})
      return Promise.resolve(new Response(null, { headers: { etag: '"b"' } }))
    }))
    stop = startUpdateNotice({ intervalMs: 600_000 })
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(10_100)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(call).toBe(3)
    expect(document.querySelector('.booqy-update')).not.toBeNull()
  })

  it('brings Ladda om back when the reload did not happen, even if the files hang', async () => {
    vi.useFakeTimers()
    const s = document.createElement('script')
    s.src = `${location.origin}/assets/app.js`
    document.head.appendChild(s)
    let round = 0
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) =>
      init?.method === 'HEAD'
        ? Promise.resolve(new Response(null, { headers: { etag: round++ ? '"b"' : '"a"' } }))
        : new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))))
    stop = startUpdateNotice({ intervalMs: 600_000 })
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    const btn = document.querySelector<HTMLButtonElement>('.booqy-update__reload')!
    btn.click()
    expect(btn.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(3_000 + 8_000 - 100)
    expect(btn.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(btn.disabled).toBe(false)
    expect(btn.textContent).toBe('Ladda om')
    expect(document.querySelector('.booqy-update')?.textContent).toContain('Kunde inte ladda om. Försök igen.')
    s.remove()
  })
})
