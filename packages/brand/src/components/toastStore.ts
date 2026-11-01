import type { ReactNode } from 'react'
import type { Tone } from './Bar'

export interface ToastItem {
  id: number
  message: ReactNode
  tone: Tone
  timeoutMs: number
}

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: ReactNode, { tone = 'success', timeoutMs = 5000 }: { tone?: Tone; timeoutMs?: number } = {}): number {
  const id = nextId++
  items = [...items, { id, message, tone, timeoutMs }]
  emit()
  return id
}

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id)
  emit()
}

export function subscribeToasts(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const toastList = () => items
