import { ApiError, BOT_CHECK_FAILED, BOT_CHECK_UNAVAILABLE } from './api'

/** Säkerhetskontrollens fel (shared/botCheck.ts) som text till gästen. */
export const BOT_CHECK_TEXT: Record<string, string> = {
  [BOT_CHECK_UNAVAILABLE]:
    'Säkerhetskontrollen kunde inte laddas. Kontrollera uppkopplingen, stäng av blockerande tillägg för sidan och försök igen.',
  [BOT_CHECK_FAILED]:
    'Säkerhetskontrollen gick inte igenom. Försök igen om en stund. Fungerar det ändå inte, kontakta restaurangen.',
}

/** Texten om felet kommer från säkerhetskontrollen, annars null. Felkoden
 * kan ligga i meddelandet eller i svaret som {error} eller {code}. */
export function botCheckMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null
  for (const code of [err.message, err.body.error, err.body.code]) {
    if (typeof code === 'string' && BOT_CHECK_TEXT[code]) return BOT_CHECK_TEXT[code]
  }
  return null
}
