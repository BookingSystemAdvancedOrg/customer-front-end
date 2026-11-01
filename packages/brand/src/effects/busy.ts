/**
 * Work in flight (save, publish, send, load). Every call counts up when it
 * starts and down when it ends; the busy Bar shows while anything runs.
 */
let count = 0
let finishedAt = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function busyStart(): void {
  count += 1
  emit()
}

export function busyEnd(): void {
  count = Math.max(0, count - 1)
  if (count === 0) finishedAt = Date.now()
  emit()
}

/** Runs `work` as busy work, also when it fails. */
export async function withBusy<T>(work: () => Promise<T>): Promise<T> {
  busyStart()
  try {
    return await work()
  } finally {
    busyEnd()
  }
}

export interface BusyState {
  active: boolean
  /** When the last piece of work finished (for the done phase). */
  finishedAt: number
}

let snapshot: BusyState = { active: false, finishedAt: 0 }

export function busySnapshot(): BusyState {
  if (snapshot.active !== count > 0 || snapshot.finishedAt !== finishedAt) snapshot = { active: count > 0, finishedAt }
  return snapshot
}

export function subscribeBusy(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tests only. */
export function resetBusyForTests(): void {
  count = 0
  finishedAt = 0
  emit()
}
