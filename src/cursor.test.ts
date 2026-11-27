// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The owner 2026-11-27: the pointer is the same arrow everywhere on the guest site.
describe('pointer', () => {
  it('forces the default cursor on every element in the last loaded stylesheet', () => {
    const css = readFileSync(new URL('./booqy-look.css', import.meta.url), 'utf8')
    expect(css).toMatch(/html \*,\s*html \*::before,\s*html \*::after \{\s*cursor: default !important;/)
    const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
    const imports = main.split('\n').filter((l) => /^import '.*\.css'/.test(l))
    expect(imports.at(-1)).toBe("import './booqy-look.css'")
  })
})
