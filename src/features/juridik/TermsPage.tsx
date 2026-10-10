import { useSite } from '../../shared/SiteContext'
import { useLocationInfo } from '../../shared/useLocationInfo'

/** Bokningsvillkor. Mallen ska granskas juridiskt innan lansering. */
export default function TermsPage() {
  const { config } = useSite()
  const info = useLocationInfo()
  return (
    <article className="page-prose">
      <h1>Bokningsvillkor</h1>
      <p className="cell-muted">{config.legal.legalName} · {config.tenant.name}</p>

      <h2>Din bokning</h2>
      <ul>
        <li>Bokningen gäller det datum, den tid och det antal personer som står i bekräftelsen.</li>
        <li>Bordet är ditt under den bokade tiden. Kommer du senare än avtalat kan bordet lämnas till andra gäster.</li>
        <li>Ska ni bli fler eller färre - hör av dig så gör vi vårt bästa.</li>
      </ul>

      <h2>Avbokning</h2>
      <p>
        Du kan avboka kostnadsfritt fram till bokningens starttid via länken i din bokningsbekräftelse.
        {info.phone ? ` Du kan också ringa oss på ${info.phone}.` : ''}
      </p>

      <h2>Personuppgifter</h2>
      <p>Hur vi hanterar dina uppgifter står i vår integritetspolicy.</p>
    </article>
  )
}
