import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BackButton } from './BackButton'

const KIT = join(__dirname, '..')
const APP = join(__dirname, '../../../../src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

describe('BackButton', () => {
  it('is a button with an arrow that says Tillbaka by default', async () => {
    const onClick = vi.fn()
    render(<BackButton onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Tillbaka' })
    expect(button).toHaveClass('btn-secondary', 'back-btn')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

// Tillbaka-kontroller är alltid BackButton, aldrig en textknapp eller länk.
describe('no plain back controls', () => {
  it('finds no old back patterns in the kit or the app', () => {
    const bad: string[] = []
    for (const f of [...sourceFiles(KIT), ...sourceFiles(APP)]) {
      if (f.endsWith('BackButton.tsx')) continue
      const text = readFileSync(f, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (line.includes('<BackButton') || /^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (/^\s*Tillbaka\b/.test(line) || /className="[^"]*\b(?:pay-back|checkout-back)\b/.test(line)) bad.push(`${relative(KIT, f)}:${i + 1}`)
      })
      for (const m of text.matchAll(/<([A-Za-z.]+)\b[^<>]*>\s*(Tillbaka|Ändra beställningen|Ändra varukorgen)\b/g)) {
        if (m[1] !== 'BackButton') bad.push(`${relative(KIT, f)}: <${m[1]}> ${m[2]}`)
      }
    }
    expect(bad).toEqual([])
  })
})
