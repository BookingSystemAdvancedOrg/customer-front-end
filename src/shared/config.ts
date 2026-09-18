/**
 * Byggtidskonfiguration för kundsajten. Systemet driftsätts med en instans
 * per restaurang, så plats-ID:t är ett deployvärde (project.env / .env) —
 * kundsajten kan inte slå upp det själv eftersom platskatalogen
 * (GET /locations) kräver inloggning, vilket kundsajten medvetet saknar.
 */
export const LOCATION_ID = (
  import.meta.env.VITE_LOCATION_ID as string | undefined
)?.trim()

export function isLocationConfigured(): boolean {
  return Boolean(LOCATION_ID) && !LOCATION_ID?.includes('REPLACE_ME')
}
