import type { GuaranteeTerms } from './site'

/**
 * Bokningsvillkoren som text, byggda från platsens riktiga kortgaranti
 * (GET /site-config: `guarantee`, `gracePeriodMinutes`). Villkorssidan,
 * sammanfattningen vid bokningen, kortsteget och bekräftelsen använder
 * samma funktioner, så gästen ser samma ord och belopp överallt.
 * Bekräftelsemejlet har samma formuleringar i application
 * shared/messages.py (guarantee_lines).
 *
 * Sen ankomst kostar aldrig något: bara ett uteblivet besök (ingen kommer)
 * eller en sen avbokning kan debiteras.
 */

export const NOTHING_CHARGED = 'Inget dras från kortet nu.'
export const WAIVER = 'Restaurangen kan efterskänka avgiften vid sjukdom eller liknande.'

/** 1000 -> "1 000 kr". */
export function formatKr(kr: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: kr % 1 ? 2 : 0 }).format(kr)} kr`
}

export const persons = (n: number) => (n === 1 ? '1 person' : `${n} personer`)
export const hours = (n: number) => (n === 1 ? '1 timme' : `${n} timmar`)
const minutes = (n: number) => (n === 1 ? '1 minut' : `${n} minuter`)

/** En sen avbokning kostar bara med en tidsgräns: vid 0 h stänger avbokningen vid starttiden. */
export function lateCancelApplies(t: GuaranteeTerms): boolean {
  return t.lateCancelFeePerPerson > 0 && t.cancelCutoffHours > 0
}

function fee(perPerson: number, partySize?: number): string {
  const text = `${formatKr(perPerson)}/person`
  return partySize && partySize > 1 ? `${text} (${formatKr(perPerson * partySize)} för ${persons(partySize)})` : text
}

/**
 * Avgifterna som korta rader, per person och (med sällskapets storlek)
 * totalt. `freeUntil` ("torsdag 29 oktober kl 18:00") ger den exakta
 * sista tiden för kostnadsfri avbokning.
 */
export function feeLines(t: GuaranteeTerms, partySize?: number, freeUntil?: string | null): string[] {
  const lines: string[] = []
  if (t.noShowFeePerPerson > 0) lines.push(`Uteblivet besök: ${fee(t.noShowFeePerPerson, partySize)}.`)
  if (lateCancelApplies(t)) {
    lines.push(`Avbokning senare än ${hours(t.cancelCutoffHours)} före: ${fee(t.lateCancelFeePerPerson, partySize)}.`)
    lines.push(
      freeUntil
        ? `Kostnadsfri avbokning senast ${freeUntil}.`
        : `Kostnadsfri avbokning fram till ${hours(t.cancelCutoffHours)} före bokad tid.`,
    )
  } else {
    lines.push('Kostnadsfri avbokning fram till bokad tid.')
  }
  return lines
}

/** Bokningens ögonblicksbild (öre, hela sällskapet) som villkor per person i kr. */
export function fromSnapshot(
  g: { noShowFee: number; lateCancelFee: number; cancelCutoffHours: number },
  partySize: number,
): GuaranteeTerms {
  const n = Math.max(1, partySize)
  return {
    minPartySize: 1,
    noShowFeePerPerson: g.noShowFee / 100 / n,
    lateCancelFeePerPerson: g.lateCancelFee / 100 / n,
    cancelCutoffHours: g.cancelCutoffHours,
  }
}

/** "2026-10-29T17:00:00Z" -> "torsdag 29 oktober kl 18:00" i restaurangens tidszon. */
export function formatDeadline(iso: string, timeZone = 'Europe/Stockholm'): string {
  const format = (tz: string) => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso))
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('weekday')} ${get('day')} ${get('month')} kl ${get('hour')}:${get('minute')}`
  }
  try {
    return format(timeZone)
  } catch {
    return format('Europe/Stockholm')
  }
}

export interface TermsSection {
  id: 'bokning' | 'sen' | 'kortgaranti' | 'avbokning' | 'fragor' | 'betalning' | 'personuppgifter'
  heading: string
  items: string[]
}

export interface TermsContext {
  legalName: string
  graceMinutes?: number | null
  phone?: string
  email?: string
}

/** Hela villkorssidan. Utan kortgaranti (null) blir det den enkla versionen. */
export function bookingTerms(t: GuaranteeTerms | null, ctx: TermsContext): TermsSection[] {
  const contact = [ctx.phone, ctx.email].filter(Boolean).join(' eller ')
  const late = t && lateCancelApplies(t)
  const sections: TermsSection[] = [
    {
      id: 'bokning',
      heading: 'Din bokning',
      items: [
        `Bokningen är ett avtal mellan dig och ${ctx.legalName}.`,
        'Den gäller det datum, den tid och det antal personer som står i din bokningsbekräftelse.',
        'Bordet är ditt under den bokade tiden.',
        'Ska ni bli fler eller färre, hör av dig så gör vi vårt bästa.',
      ],
    },
    {
      id: 'sen',
      heading: 'Om du blir sen',
      items: [
        ctx.graceMinutes
          ? `Vi håller bordet i ${minutes(ctx.graceMinutes)} efter bokad tid. Kommer du senare kan bordet ges till andra gäster.`
          : 'Kommer du senare än bokad tid kan bordet ges till andra gäster.',
        ctx.phone ? `Ring oss gärna på ${ctx.phone} om du blir sen.` : 'Hör gärna av dig om du blir sen.',
        ...(t ? ['Att komma sent kostar ingenting. Kommer du, även sent, räknas det inte som ett uteblivet besök.'] : []),
      ],
    },
  ]
  if (t) {
    sections.push({
      id: 'kortgaranti',
      heading: 'Kortgaranti',
      items: [
        t.minPartySize > 1
          ? `Restaurangen tar kortgaranti för sällskap om ${persons(t.minPartySize)} eller fler. Mindre sällskap behöver inget kort.`
          : 'Restaurangen tar kortgaranti för alla bokningar.',
        'När du bokar sparar du ett betalkort. Inget dras från kortet när du bokar.',
        ...feeLines(t),
        ...(t.noShowFeePerPerson > 0
          ? ['Avgiften för uteblivet besök dras bara om ingen i sällskapet kommer och bokningen inte är avbokad, och först när restaurangen har registrerat bokningen som utebliven.']
          : []),
        ...(late
          ? [`Avgiften för sen avbokning dras när du avbokar senare än ${hours(t.cancelCutoffHours)} före bokad tid. Du ser beloppet och godkänner det innan avbokningen genomförs.`]
          : []),
        'Avgiften dras från det sparade kortet och du får ett kvitto via e-post.',
        'Beloppen och tidsgränsen i din bokningsbekräftelse gäller för din bokning, även om restaurangen ändrar sina villkor senare.',
        `${WAIVER} Hör av dig så snart du kan.`,
      ],
    })
  }
  sections.push(
    {
      id: 'avbokning',
      heading: 'Avbokning',
      items: [
        ...(t && late
          ? [
              `Du kan avboka kostnadsfritt fram till ${hours(t.cancelCutoffHours)} före bokad tid. Därefter kostar avbokningen ${formatKr(t.lateCancelFeePerPerson)} per person.`,
              ...(t.minPartySize > 1
                ? [`För sällskap under ${persons(t.minPartySize)} är avbokningen kostnadsfri fram till bokad tid.`]
                : []),
            ]
          : ['Du kan avboka kostnadsfritt fram till bokad tid.']),
        `Avboka via länken "Se eller avboka din bokning" i bekräftelsemejlet${ctx.phone ? ` eller ring oss på ${ctx.phone}` : ''}.`,
      ],
    },
    {
      id: 'fragor',
      heading: t ? 'Återbetalning och frågor' : 'Frågor',
      items: [
        ...(t
          ? ['Tycker du att en avgift har dragits fel, kontakta restaurangen så snart som möjligt. Restaurangen kan återbetala hela eller delar av avgiften till kortet.']
          : []),
        contact ? `Frågor om din bokning: kontakta oss på ${contact}.` : 'Frågor om din bokning: kontakta restaurangen.',
      ],
    },
  )
  if (t) {
    sections.push({
      id: 'betalning',
      heading: 'Betalning',
      items: [
        `Kortet sparas och eventuella avgifter dras via Stripe, direkt till restaurangens eget Stripe-konto (${ctx.legalName}).`,
        'Kortuppgifterna sparas hos Stripe, aldrig hos restaurangen eller Booqy.',
      ],
    })
  }
  sections.push({
    id: 'personuppgifter',
    heading: 'Personuppgifter',
    items: ['Hur vi hanterar dina uppgifter står i vår integritetspolicy.'],
  })
  return sections
}
