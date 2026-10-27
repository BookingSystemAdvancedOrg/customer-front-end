import { describe, expect, it } from 'vitest'
import { openStatus } from './locationApi'

// 2026-10-19 är en måndag. Tider i Stockholm (UTC+2 i oktober före omställningen).
const at = (iso: string) => new Date(iso)
const hours = {
  monday: [{ opensAt: '11:00', closesAt: '22:00' }],
  tuesday: [{ opensAt: '11:00', closesAt: '22:00' }],
  friday: [{ opensAt: '18:00', closesAt: '02:00' }],
}

describe('openStatus', () => {
  it('öppet just nu', () => {
    expect(openStatus(hours, [], 'Europe/Stockholm', at('2026-10-19T12:00:00Z'))).toEqual({ open: true, text: 'Öppet till 22:00' })
  })
  it('öppnar senare idag', () => {
    expect(openStatus(hours, [], 'Europe/Stockholm', at('2026-10-19T06:00:00Z'))).toEqual({ open: false, text: 'Öppnar 11:00' })
  })
  it('stängt för dagen: nästa öppning i morgon', () => {
    expect(openStatus(hours, [], 'Europe/Stockholm', at('2026-10-19T21:00:00Z'))).toEqual({ open: false, text: 'Öppnar i morgon 11:00' })
  })
  it('hoppar över stängda dagar', () => {
    expect(openStatus(hours, [], 'Europe/Stockholm', at('2026-10-20T21:00:00Z'))).toEqual({ open: false, text: 'Öppnar fre 18:00' })
  })
  it('pass över midnatt räknas efter midnatt', () => {
    expect(openStatus(hours, [], 'Europe/Stockholm', at('2026-10-23T23:30:00Z'))).toEqual({ open: true, text: 'Öppet till 02:00' })
  })
  it('avvikande stängd dag går före schemat', () => {
    const s = openStatus(hours, [{ date: '2026-10-19', kind: 'closed' }], 'Europe/Stockholm', at('2026-10-19T12:00:00Z'))
    expect(s).toEqual({ open: false, text: 'Öppnar i morgon 11:00' })
  })
  it('inga tider alls', () => {
    expect(openStatus({}, [], 'Europe/Stockholm', at('2026-10-19T12:00:00Z'))).toEqual({ open: false, text: 'Stängt' })
  })
})
