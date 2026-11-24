/**
 * Bordens namn som gästen läser. Ett bord heter efter sin etikett: numret
 * över alla våningar ("3") eller ett eget namn ("Bar"). Ett nummer får ordet
 * Bord framför sig ("Bord 3"), ett eget namn visas som det är. Ett bord vars
 * etikett inte är känd heter "Ett bord" / "2 bord": ett bords id visas aldrig.
 */

const startsWithDigit = (label: string) => /^\d/.test(label)

/** "Bord 3", "Bar" eller bara "Bord" (tom etikett). */
export function tableTitle(label: string): string {
  const l = label.trim()
  if (!l) return 'Bord'
  return startsWithDigit(l) ? `Bord ${l}` : l
}

/**
 * Flera bord: ordet en gång, sedan numren och de egna namnen
 * ("Bord 3 + 4", "Bord 3 + Bar", "Bar"). Är någon etikett okänd:
 * "Ett bord" (eller "ett bord" med word 'bord') respektive "2 bord".
 */
export function tableNames(
  labels: (string | null | undefined)[],
  { join = ' + ', word = 'Bord' }: { join?: string; word?: string } = {},
): string {
  const known = labels.map((l) => l?.trim() ?? '')
  if (known.length === 0 || known.some((l) => !l)) {
    if (labels.length > 1) return `${labels.length} bord`
    return word === 'bord' ? 'ett bord' : 'Ett bord'
  }
  const numbers = known.filter(startsWithDigit)
  const own = known.filter((l) => !startsWithDigit(l))
  const parts = numbers.length > 0 ? [`${word} ${numbers.join(join)}`, ...own] : own
  return parts.join(join)
}
