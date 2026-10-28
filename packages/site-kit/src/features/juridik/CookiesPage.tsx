import { Link } from 'react-router-dom'
import { useSite } from '../../shared/SiteContext'
import { STORAGE_REGISTRY } from '../../shared/storageRegistry'
import type { StorageCategory, StorageKind } from '../../shared/storageRegistry'

const KIND_LABEL: Record<StorageKind, string> = {
  cookie: 'Cookie',
  localStorage: 'Lokal lagring',
  sessionStorage: 'Sessionslagring',
  ingen: 'Ingen lagring',
}

const CATEGORY_LABEL: Record<StorageCategory, string> = {
  nödvändig: 'Nödvändig',
  funktionell: 'Funktionell',
  analys: 'Analys',
  marknadsföring: 'Marknadsföring',
}

/**
 * Cookieinformation för restaurangens webbplats (/cookies). Allt ritas från
 * storageRegistry.ts, samma lista som koden använder, så sidan kan inte
 * glida isär från vad sajten faktiskt sparar. Inget här kräver samtycke
 * (lagen om elektronisk kommunikation 9 kap. 28 §, undantaget för det
 * gästen själv bett om), så sajten har ingen cookiebanner.
 */
export default function CookiesPage() {
  const { config } = useSite()
  return (
    <article className="page-prose">
      <h1>Cookies och lagring</h1>
      <p className="cell-muted">Gäller {config.tenant.name}s webbplats.</p>
      <p>
        Webbplatsen använder inga cookies för statistik, spårning eller reklam, och inga sådana
        tjänster från tredje part. Det som sparas i din webbläsare behövs för det du själv gör här
        (välja plats, boka, beställa, betala) eller för att skydda bokningen mot robotar och
        kortbedrägerier. Därför frågar vi inte om samtycke och visar ingen cookiebanner.
      </p>

      <h2>Det här sparas</h2>
      <div className="storage-table-wrap">
        <table className="storage-table">
          <thead>
            <tr>
              <th scope="col">Namn</th>
              <th scope="col">Vad det gör</th>
              <th scope="col">Sätts av</th>
              <th scope="col">Sparas</th>
              <th scope="col">Typ</th>
            </tr>
          </thead>
          <tbody>
            {STORAGE_REGISTRY.map((entry) => (
              <tr key={entry.name}>
                <td>
                  <code>{entry.name}</code>
                  <span className="storage-kind">{KIND_LABEL[entry.kind]}</span>
                </td>
                <td>
                  {entry.purpose}
                  {entry.where ? <span className="storage-where"> ({entry.where})</span> : null}
                </td>
                <td>{entry.setBy}</td>
                <td>{entry.lifetime}</td>
                <td>{CATEGORY_LABEL[entry.category]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Tredje parter</h2>
      <ul>
        <li>
          <strong>Stripe</strong> (betalningar och kortgarantier) laddas bara på betalningssteget och
          sätter där sina egna cookies mot kortbedrägerier.
        </li>
        <li>
          <strong>Cloudflare Turnstile</strong> kontrollerar att en bokning, beställning eller
          cateringförfrågan görs av en människa.
        </li>
      </ul>

      <h2>Så rensar du</h2>
      <p>
        Du kan ta bort allt detta i webbläsarens inställningar. Då glöms bara vald plats, ljust eller
        mörkt läge och en eventuell varukorg; inget annat på sajten påverkas.
      </p>
      <p>
        Mer om hur dina personuppgifter behandlas finns i <Link to="/integritetspolicy">integritetspolicyn</Link>.
      </p>
    </article>
  )
}
