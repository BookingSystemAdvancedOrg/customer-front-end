import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { applyTheme, currentTheme, setTheme, storedTheme, systemTheme } from './theme'
import { THEME_KEY } from './storageRegistry'

describe('theme', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_KEY)
    document.documentElement.removeAttribute('data-theme')
  })
  afterEach(() => {
    localStorage.removeItem(THEME_KEY)
    document.documentElement.removeAttribute('data-theme')
  })

  it('follows the system until the guest chooses', () => {
    expect(storedTheme()).toBeNull()
    expect(currentTheme()).toBe(systemTheme())
  })

  it('setTheme stores the choice and marks the page', () => {
    setTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(currentTheme()).toBe('dark')
  })

  it('applyTheme only marks the page', () => {
    applyTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(currentTheme()).toBe('dark')
  })

  it('the toggle names the mode in effect and what a press does', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Ljust läge, byt till mörkt' })
    fireEvent.click(button)
    expect(button).toHaveAccessibleName('Mörkt läge, byt till ljust')
    expect(button).toHaveAttribute('data-mode', 'dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    fireEvent.click(button)
    expect(button).toHaveAttribute('data-mode', 'light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })
})
