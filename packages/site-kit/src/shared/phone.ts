/**
 * Telefonnummer som man skriver dem: "0723001573" visas direkt som
 * "+46 72 300 15 73" och skickas som "+46723001573" (E.164, som alla API:n
 * redan normaliserar till). Samma fil finns i admin-front-end,
 * customer-front-end och booqy-console (web) - ändra alla tre tillsammans.
 * normalizePhone följer serverns regler (application/shared/reservations.py).
 */

/** Svenskt mobilnummer utan inledande nolla: "701740605", "70 174 06 05". */
const SE_MOBILE_NO_ZERO = /^7\d{8}$/

/** Högst så många siffror efter +46 (svenska nationella nummer). */
const SE_MAX = 9
/** E.164 tillåter högst 15 siffror totalt. */
const E164_MAX = 15

/**
 * Det som skickas: "+46723001573", "" för ett tomt fält, och "+" medan man
 * just börjat skriva ett utländskt nummer. 07.../08... blir +46, 00 blir +.
 * Ett svenskt mobilnummer utan nolla (nio siffror som börjar på 7) blir
 * +46. Annars gissas inget när det varken börjar med + eller 0 (12345678
 * kan vara ett felskrivet nummer): siffrorna lämnas som de är, så
 * formuläret säger till.
 */
export function toE164(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const plus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (!plus) {
    if (digits.startsWith('00')) digits = digits.slice(2)
    else if (digits.startsWith('0')) digits = '46' + digits.slice(1)
    else if (SE_MOBILE_NO_ZERO.test(digits)) digits = '46' + digits
    else return digits.slice(0, E164_MAX)
  }
  if (digits.startsWith('46')) {
    let national = digits.slice(2)
    if (national.startsWith('0')) national = national.slice(1) // +46 070... -> +46 70...
    digits = '46' + national.slice(0, SE_MAX)
  } else {
    digits = digits.slice(0, E164_MAX)
  }
  if (!digits) return plus ? '+' : ''
  return '+' + digits
}

function groups(digits: string, sizes: number[]): string[] {
  const out: string[] = []
  let rest = digits
  for (const size of sizes) {
    if (!rest) break
    out.push(rest.slice(0, size))
    rest = rest.slice(size)
  }
  if (rest) out.push(rest)
  return out
}

/**
 * Visningen: "+46 72 300 15 73" (mobil), "+46 8 123 45 67" (Stockholm),
 * "+46 31 123 45 67" (övriga riktnummer). Utländska nummer får landskoden
 * (gissad som två siffror) och sedan grupper om tre.
 */
export function formatPhone(value: string): string {
  const e164 = toE164(value)
  if (!e164.startsWith('+') || e164.length <= 1) return e164
  const digits = e164.slice(1)
  if (digits.startsWith('46')) {
    const national = digits.slice(2)
    // Stockholm: 8 123 45 67, eller 8 123 456 78 när numret är åtta siffror.
    const sizes = national.startsWith('8') ? (national.length === 9 ? [1, 3, 3, 2] : [1, 3, 2, 2]) : [2, 3, 2, 2]
    return ['+46', ...groups(national, sizes)].join(' ')
  }
  return ['+' + digits.slice(0, 2), ...groups(digits.slice(2), [3, 3, 3, 3])].join(' ')
}

/**
 * En ändring i fältet: nytt värde att skicka, ny visning och var markören
 * ska stå. Raderar man ett mellanslag (backsteg mellan två grupper) tas
 * siffran före det bort i stället - annars hade backsteg inte gjort något.
 * Markören hamnar före lika många siffror som stod efter den, så den
 * stannar på rätt ställe när grupperna flyttar sig.
 */
export function editPhone(
  previous: string,
  raw: string,
  caret: number,
): { value: string; display: string; caret: number } {
  let text = raw
  let at = caret
  const significant = (s: string) => s.replace(/[^\d+]/g, '')
  if (raw.length < previous.length && significant(raw) === significant(previous)) {
    const before = raw.slice(0, caret)
    const idx = before.search(/\d(?=\D*$)/)
    if (idx >= 0) {
      text = raw.slice(0, idx) + raw.slice(idx + 1)
      at = idx
    }
  }
  const after = (text.slice(at).match(/\d/g) ?? []).length
  const value = toE164(text)
  const display = formatPhone(value)
  let pos = display.length
  if (after > 0) {
    let seen = 0
    for (let i = display.length - 1; i >= 0; i--) {
      if (/\d/.test(display[i]) && ++seen === after) {
        pos = i
        break
      }
    }
    if (seen < after) pos = 0
  }
  return { value, display, caret: pos }
}

const E164 = /^\+[1-9]\d{7,14}$/

/**
 * Telefonnummer som servern sparar dem (E.164), eller null om servern
 * skulle neka numret: "070-123 45 67", "70 123 45 67", "+46 70 123 45 67"
 * och "0046701234567" blir alla "+46701234567". Svenska nummer ska ha 7-9
 * siffror efter +46, mobilnummer (7...) exakt 9.
 */
export function normalizePhone(raw: string): string | null {
  let s = raw.trim().replace(/[\s\-.]/g, '')
  s = s.replace(/^(\+\d{1,3})\(0\)/, '$1').replace(/[()]/g, '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  else if (s.startsWith('0')) s = `+46${s.slice(1)}`
  else if (SE_MOBILE_NO_ZERO.test(s)) s = `+46${s}`
  if (s.startsWith('+460')) s = `+46${s.slice(4)}` // +46 070... -> +46 70...
  if (!E164.test(s)) return null
  if (s.startsWith('+46')) {
    const national = s.slice(3)
    if (national.length < 7 || national.length > 9) return null
    if (national.startsWith('7') && national.length !== 9) return null
  }
  return s
}

/** Riktnummer med två siffror efter nollan (011, 031, 040 ...); övriga har tre (0411 ...). */
const SE_TWO_DIGIT_AREA = new Set([
  '11', '13', '16', '18', '19', '21', '23', '26', '31', '33', '35', '36',
  '40', '42', '44', '46', '54', '60', '63', '90',
])

/** Abonnentnumret i svenska grupper: "123 45 67", "123 456 78", "12 34 56". */
function subscriberGroups(digits: string): string {
  const sizes: Record<number, number[]> = { 5: [3, 2], 6: [2, 2, 2], 7: [3, 2, 2], 8: [3, 3, 2] }
  return groups(digits, sizes[digits.length] ?? [3, 3, 3]).join(' ')
}

/**
 * Ett nummer som gäster läser det: "+46701740605" -> "070-174 06 05",
 * "+4681234567" -> "08-123 45 67", "+46311234567" -> "031-123 45 67".
 * Utländska nummer visas som formatPhone ("+47 123 456 78"); det som inte
 * är ett telefonnummer visas som det stod.
 */
export function formatPhoneNational(value: string): string {
  const e164 = normalizePhone(value)
  if (!e164) return value.trim()
  if (!e164.startsWith('+46')) return formatPhone(e164)
  const national = e164.slice(3)
  const areaLength = national.startsWith('8') ? 1
    : national.startsWith('7') || SE_TWO_DIGIT_AREA.has(national.slice(0, 2)) ? 2 : 3
  return `0${national.slice(0, areaLength)}-${subscriberGroups(national.slice(areaLength))}`
}

/** tel:-länken till ett nummer, alltid i E.164 när numret går att läsa: "tel:+46701740605". */
export function phoneHref(value: string): string {
  return `tel:${normalizePhone(value) ?? value.replace(/[^\d+]/g, '')}`
}
