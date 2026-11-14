import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { editPhone, formatPhone, formatPhoneNational, phoneHref, toE164 } from './phone'
import { PhoneLink } from './PhoneLink'
import { PhoneInput } from './PhoneInput'

describe('toE164', () => {
  it.each([
    ['0723001573', '+46723001573'],
    ['072-300 15 73', '+46723001573'],
    ['+46 72 300 15 73', '+46723001573'],
    ['+46 (0)72 300 15 73', '+46723001573'],
    ['0046723001573', '+46723001573'],
    ['723001573', '+46723001573'], // Swedish mobile without the 0
    ['72 300 15 73', '+46723001573'],
    ['12345678', '12345678'], // no 0, + or mobile: left alone, the form flags it
    ['72300157', '72300157'], // a digit short: not guessed
    ['08-123 45 67', '+4681234567'],
    ['+4712345678', '+4712345678'],
    ['07230015739999', '+46723001573'], // capped at 9 national digits
    ['', ''],
    ['+', '+'],
    ['abc', ''],
  ])('%s -> %s', (raw, expected) => {
    expect(toE164(raw)).toBe(expected)
  })
})

describe('formatPhone', () => {
  it.each([
    ['0723001573', '+46 72 300 15 73'],
    ['0812345678', '+46 8 123 456 78'],
    ['081234567', '+46 8 123 45 67'],
    ['0311234567', '+46 31 123 45 67'],
    ['07', '+46 7'],
    ['0', '+46'],
    ['+4712345678', '+47 123 456 78'],
  ])('%s -> %s', (raw, expected) => {
    expect(formatPhone(raw)).toBe(expected)
  })
})

describe('formatPhoneNational', () => {
  it.each([
    ['+46701740605', '070-174 06 05'],
    ['0701740605', '070-174 06 05'],
    ['+4681234567', '08-123 45 67'],
    ['+46812345678', '08-123 456 78'],
    ['+46311234567', '031-123 45 67'],
    ['+4640123456', '040-12 34 56'],
    ['+46411123456', '0411-12 34 56'],
    ['+4712345678', '+47 123 456 78'],
    ['ring receptionen', 'ring receptionen'],
  ])('%s -> %s', (raw, expected) => {
    expect(formatPhoneNational(raw)).toBe(expected)
  })
})

describe('PhoneLink', () => {
  it('shows the Swedish format and dials E.164', () => {
    render(<PhoneLink phone="+46701740605" />)
    const link = screen.getByRole('link', { name: '070-174 06 05' })
    expect(link).toHaveAttribute('href', 'tel:+46701740605')
    expect(phoneHref('070-174 06 05')).toBe('tel:+46701740605')
  })
})

describe('editPhone', () => {
  it('backspace on a space removes the digit before it', () => {
    // "+46 72 300| 15 73" -> backspace removes the space -> digit 0 goes
    const out = editPhone('+46 72 300 15 73', '+46 72 30015 73', 10)
    expect(out.value).toBe('+4672301573')
    expect(out.display).toBe('+46 72 301 57 3')
  })

  it('keeps the caret before the same digits after regrouping', () => {
    // typing 9 right after "72" in "+46 72 300 15 7"
    const out = editPhone('+46 72 300 15 7', '+46 729 300 15 7', 7)
    expect(out.display).toBe('+46 72 930 01 57')
    expect(out.display.slice(out.caret)).toBe('30 01 57')
  })
})

describe('PhoneInput', () => {
  function Harness() {
    const [value, setValue] = useState('')
    return (
      <>
        <label htmlFor="p">Telefon</label>
        <PhoneInput id="p" value={value} onChange={setValue} />
        <output>{value}</output>
      </>
    )
  }

  it('formats while typing and hands the parent E.164', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Telefon'), '0723001573')
    expect(screen.getByLabelText('Telefon')).toHaveValue('+46 72 300 15 73')
    expect(screen.getByRole('status')).toHaveTextContent('+46723001573')
  })

  it('turns a mobile number typed without the 0 into +46', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Telefon'), '70 174 06 05')
    expect(screen.getByLabelText('Telefon')).toHaveValue('+46 70 174 06 05')
    expect(screen.getByRole('status')).toHaveTextContent('+46701740605')
  })

  it('backspace works through the spaces', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Telefon')
    await user.type(input, '0723001573')
    await user.type(input, '{Backspace}{Backspace}{Backspace}')
    expect(input).toHaveValue('+46 72 300 1')
  })
})
