import { afterEach, describe, expect, it } from 'vitest'
import { countUp, formatStatValue, parseStatValue } from './effects/countUp'
import { busyEnd, busySnapshot, busyStart, resetBusyForTests, withBusy } from './effects/busy'
import { THEME_KEY, configureTheme, currentTheme, setTheme, switchTheme } from './effects/theme'
import { DEFAULT_VOLUME, SOUND_KEY, SOUND_VOLUME_KEY, clickSamples, setSound, setSoundVolume, soundOn, soundVolume, voiceSamples } from './effects/sound'
import { setBarValue } from './effects/bar'
import { Liquid, pourLiquid } from './effects/liquid'
import { easeOutExpo } from './effects/motion'

describe('count-up', () => {
  it('parses and formats Swedish figures with prefix and suffix', () => {
    const n = parseStatValue('1 250,50 kr')!
    expect(n).toEqual({ prefix: '', value: 1250.5, decimals: 2, suffix: ' kr' })
    expect(formatStatValue(n, 1250.5)).toBe('1 250,50 kr')
    expect(formatStatValue(parseStatValue('6,9 %')!, 3.21)).toBe('3,2 %')
    expect(parseStatValue('-')).toBeNull()
  })

  it('lands exactly on the text (reduced motion: at once)', () => {
    const el = document.createElement('span')
    let done = -1
    countUp(el, '1 250 kr', { onDone: (v) => (done = v) })
    expect(el.textContent).toBe('1 250 kr')
    expect(done).toBe(1250)
  })

  it('eases out and ends at 1', () => {
    expect(easeOutExpo(0)).toBe(0)
    expect(easeOutExpo(0.1)).toBeGreaterThan(0.4)
    expect(easeOutExpo(1)).toBe(1)
  })
})

describe('busy store', () => {
  afterEach(resetBusyForTests)
  it('counts overlapping work and ends on failure too', async () => {
    busyStart()
    await withBusy(() => Promise.reject(new Error('x'))).catch(() => undefined)
    expect(busySnapshot().active).toBe(true)
    busyEnd()
    expect(busySnapshot().active).toBe(false)
    expect(busySnapshot().finishedAt).toBeGreaterThan(0)
  })
})

describe('theme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
    configureTheme({ defaultTheme: 'light' })
  })
  it('stores the choice under booqy-theme and sets data-theme and theme-color', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
    setTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(meta.content).toBe('#1a120e')
    meta.remove()
  })
  it('defaults to light, or to the system when configured', () => {
    expect(currentTheme()).toBe('light')
    configureTheme({ defaultTheme: 'system' })
    expect(currentTheme()).toBe('light') // the test matchMedia only matches reduce
  })
  it('switches at once with reduced motion', () => {
    switchTheme('dark', { x: 10, y: 10 })
    expect(currentTheme()).toBe('dark')
  })
})

describe('click sound', () => {
  afterEach(() => localStorage.clear())
  it('is a pre-rendered buffer: 80 ms, deterministic, normalised to the voice peak', () => {
    const a = clickSamples(48000, 4200, 0.5)
    expect(a.length).toBe(3840)
    expect(Math.max(...Array.from(a, Math.abs))).toBeCloseTo(0.5, 5)
    expect(Array.from(clickSamples(48000, 4200, 0.5))).toEqual(Array.from(a))
    expect(voiceSamples(44100, 'cta').length).toBe(3528)
  })
  it('remembers on/off and volume under the shared keys', () => {
    setSound(false)
    expect(soundOn()).toBe(false)
    expect(localStorage.getItem(SOUND_KEY)).toBe('off')
    setSoundVolume(140)
    expect(soundVolume()).toBe(100)
    expect(localStorage.getItem(SOUND_VOLUME_KEY)).toBe('100')
    setSoundVolume(DEFAULT_VOLUME)
    setSound(true)
  })
})

describe('setBarValue (no-React pages)', () => {
  it('clamps, sets the variable, aria and the visible text', () => {
    const bar = document.createElement('div')
    bar.innerHTML = '<span class="bq-bar__value"></span>'
    setBarValue(bar, 1.4, '6 / 6')
    expect(bar.style.getPropertyValue('--bq-bar-value')).toBe('1.000')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(bar.getAttribute('aria-valuetext')).toBe('6 / 6')
    expect(bar.querySelector('.bq-bar__value')!.textContent).toBe('6 / 6')
  })
})

describe('liquid', () => {
  it('waves spread and settle', () => {
    const l = new Liquid(16)
    l.push(8, 4)
    for (let i = 0; i < 5; i++) l.step()
    expect(l.energy()).toBeGreaterThan(0)
    for (let i = 0; i < 2000; i++) l.step()
    expect(l.energy()).toBeLessThan(0.02)
  })
  it('shows the full state at once with reduced motion', () => {
    const host = document.createElement('div')
    const canvas = document.createElement('canvas')
    let done = false
    pourLiquid(host, canvas, { onDone: () => (done = true) })
    expect(host.classList.contains('bq-liquid--full')).toBe(true)
    expect(done).toBe(true)
  })
})
