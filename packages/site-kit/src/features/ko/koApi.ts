import { apiGet, apiPost } from '../../shared/api'
import { WAITLIST_TOKEN_PREFIX } from '../../shared/storageRegistry'

/** Kön på restaurangens sajt (CONTRACTS.md 6.F F7-F10). Token ligger i adressen (#token) och lokalt till dagens slut. */

export interface QueueStatus {
  status: 'waiting' | 'offered' | 'seated' | 'booked' | 'expired' | 'left' | 'removed'
  position: number | null
  offer?: { startTime: string; expiresAt: string }
  locationName: string
}

export const joinQueue = (locationId: string, body: {
  entryId: string; name: string; partySize: number; phone: string; email?: string; turnstileToken?: string
}) => apiPost<{ token: string; position: number | null }>(`/public/locations/${encodeURIComponent(locationId)}/waitlist`, body)
export const queueStatus = (token: string) => apiGet<QueueStatus>(`/public/waitlist/${encodeURIComponent(token)}`)
export const acceptTable = (token: string) =>
  apiPost<{ reservationId: string; manageToken: string }>(`/public/waitlist/${encodeURIComponent(token)}/accept`, {})
export const leaveQueue = (token: string) => apiPost<void>(`/public/waitlist/${encodeURIComponent(token)}/leave`, {})

interface Stored { token: string; day: string }

function today(): string {
  return new Date().toLocaleDateString('sv-SE')
}

/** Sparad plats i kön för den här restaurangen, bara samma dag. */
export function storedToken(locationId: string): string | null {
  try {
    const raw = window.localStorage.getItem(`${WAITLIST_TOKEN_PREFIX}${locationId}`)
    if (!raw) return null
    const value = JSON.parse(raw) as Stored
    if (value.day !== today()) {
      window.localStorage.removeItem(`${WAITLIST_TOKEN_PREFIX}${locationId}`)
      return null
    }
    return value.token
  } catch {
    return null
  }
}

export function storeToken(locationId: string, token: string | null): void {
  try {
    const key = `${WAITLIST_TOKEN_PREFIX}${locationId}`
    if (token) window.localStorage.setItem(key, JSON.stringify({ token, day: today() } satisfies Stored))
    else window.localStorage.removeItem(key)
  } catch {
    // Privat läge: platsen finns ändå kvar i länken i sms:et.
  }
}

export function newEntryId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

export const ERRORS: Record<string, string> = {
  queue_full: 'Kön är full just nu. Försök igen om en stund eller ring restaurangen.',
  already_queued: 'Det numret står redan i kön i dag.',
  invalid_phone: 'Kontrollera mobilnumret.',
  invalid_party_size: 'Antal personer ska vara 1-20.',
  hold_expired: 'Tiden för bordet gick ut. Säg till personalen om du fortfarande vill ha ett bord.',
  invalid_state: 'Bordet är inte klart än.',
}
