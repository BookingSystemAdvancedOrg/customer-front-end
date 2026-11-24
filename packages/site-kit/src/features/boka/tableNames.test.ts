import { describe, expect, it } from 'vitest'
import { tableNames, tableTitle } from './tableNames'

describe('tableTitle', () => {
  it('puts Bord before a number and shows an own name as it is', () => {
    expect(tableTitle('3')).toBe('Bord 3')
    expect(tableTitle(' 12 ')).toBe('Bord 12')
    expect(tableTitle('Bar')).toBe('Bar')
    expect(tableTitle('')).toBe('Bord')
  })
})

describe('tableNames', () => {
  it('names numbers once with the word, then own names', () => {
    expect(tableNames(['3'])).toBe('Bord 3')
    expect(tableNames(['3', '4'])).toBe('Bord 3 + 4')
    expect(tableNames(['3', 'Bar'])).toBe('Bord 3 + Bar')
    expect(tableNames(['Bar'])).toBe('Bar')
    expect(tableNames(['Bar', 'Hörnet'])).toBe('Bar + Hörnet')
  })

  it('takes another join and a lower case word', () => {
    expect(tableNames(['3', '4'], { join: ', ' })).toBe('Bord 3, 4')
    expect(tableNames(['3', '4'], { word: 'bord' })).toBe('bord 3 + 4')
    expect(tableNames(['Bar'], { word: 'bord' })).toBe('Bar')
  })

  it('never shows an id when a label is unknown', () => {
    expect(tableNames([null])).toBe('Ett bord')
    expect(tableNames([undefined], { word: 'bord' })).toBe('ett bord')
    expect(tableNames([''])).toBe('Ett bord')
    expect(tableNames(['3', null])).toBe('2 bord')
    expect(tableNames([null, null, null], { word: 'bord' })).toBe('3 bord')
    expect(tableNames([])).toBe('Ett bord')
  })
})
