import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useSite } from './SiteContext'
import type { ConsentChannel, SitePrivacy } from './site'

export interface ConsentChoice {
  checked: boolean
  channels: ConsentChannel[]
}

export const NO_CONSENT: ConsentChoice = { checked: false, channels: ['email'] }

type Choice = 'email' | 'sms' | 'both'

const CHOICES: { value: Choice; channels: ConsentChannel[] }[] = [
  { value: 'email', channels: ['email'] },
  { value: 'sms', channels: ['sms'] },
  { value: 'both', channels: ['email', 'sms'] },
]

function choiceOf(channels: ConsentChannel[]): Choice {
  return channels.length === 2 ? 'both' : channels[0] === 'sms' ? 'sms' : 'email'
}

/**
 * Det som skickas med formuläret: inget alls utan kryss. Med kryss samtycket
 * med serverns ordalydelse (version), eller den gamla e-postflaggan om
 * backend är äldre än samtyckesloggen.
 */
export function consentFields(
  choice: ConsentChoice,
  privacy: SitePrivacy | undefined,
  marketingFeature: boolean,
): { marketingConsent?: { channels: ConsentChannel[]; textVersion: string }; marketingOptIn?: true } {
  if (!choice.checked) return {}
  const mc = privacy?.marketingConsent
  if (mc) return { marketingConsent: { channels: choice.channels, textVersion: mc.version } }
  if (!privacy && marketingFeature && choice.channels.includes('email')) return { marketingOptIn: true }
  return {}
}

/**
 * Frivillig ruta för erbjudanden, aldrig förkryssad och aldrig ett krav för
 * bokningen eller beställningen. Visas bara när restaurangen har
 * marknadsföring påslaget. Ordalydelsen kommer från servern, så det gästen
 * ser är exakt det som sparas i samtyckesloggen. Bara de kanaler servern
 * erbjuder visas (i dag bara e-post); med en enda kanal finns inget val.
 */
export function MarketingConsent({ value, onChange }: { value: ConsentChoice; onChange: (v: ConsentChoice) => void }) {
  const { config } = useSite()
  const id = useId()
  const mc = config.privacy?.marketingConsent
  const legacy = !config.privacy && config.tenant.features.marketing
  if (!mc && !legacy) return null
  const label = mc?.label ?? `Skicka mig erbjudanden och nyheter från ${config.tenant.name} via e-post (valfritt).`
  const labels: Record<ConsentChannel, string> = { email: 'E-post', sms: 'SMS' }
  for (const c of mc?.channels ?? []) labels[c.value] = c.label
  const current = choiceOf(value.channels)
  const offered = mc ? mc.channels.map((c) => c.value) : (['email'] as ConsentChannel[])
  const choices = CHOICES.filter((c) => c.channels.every((ch) => offered.includes(ch)))
  return (
    <div className="consent-box">
      <label className="booking-check">
        <input
          type="checkbox"
          checked={value.checked}
          aria-controls={mc ? `${id}-channels` : undefined}
          onChange={(e) => onChange({ ...value, checked: e.target.checked })}
        />
        <span>{label}</span>
      </label>
      <p className="consent-more">
        {choices.length === 1 && `Via ${labels[choices[0].channels[0]].toLowerCase()}. `}
        <Link to="/integritetspolicy" target="_blank" rel="noopener">
          Läs mer i integritetspolicyn
        </Link>
      </p>
      {mc && value.checked && choices.length > 1 && (
        <fieldset className="consent-channels" id={`${id}-channels`}>
          <legend>{mc.channelQuestion}</legend>
          <div className="consent-options">
            {choices.map((c) => (
              <label key={c.value} className={`consent-option${current === c.value ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name={`${id}-channel`}
                  value={c.value}
                  checked={current === c.value}
                  onChange={() => onChange({ checked: true, channels: c.channels })}
                />
                <span>{c.value === 'both' ? 'Båda' : labels[c.channels[0]]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}
