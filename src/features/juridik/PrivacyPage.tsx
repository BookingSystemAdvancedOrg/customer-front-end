import { useSite } from '../../shared/SiteContext'
import { NoticeText } from './NoticeText'
import { STORAGE_REGISTRY } from '../../shared/storageRegistry'
import type { StorageKind } from '../../shared/storageRegistry'

const KIND_LABEL: Record<StorageKind, string> = {
  cookie: 'Cookie',
  localStorage: 'Lokal lagring',
  sessionStorage: 'Sessionslagring',
  ingen: 'Ingen lagring',
}

/**
 * Integritetspolicy för restaurangens gäster. Restaurangen är
 * personuppgiftsansvarig; plattformen (IT Hjälparna Nordic AB) är
 * personuppgiftsbiträde. Texten fylls med restaurangens juridiska uppgifter
 * från GET /site-config. Mallen ska granskas juridiskt innan lansering.
 */
export default function PrivacyPage() {
  const { config } = useSite()
  const { legal, tenant } = config
  const contact = [legal.contactEmail, legal.contactPhone].filter(Boolean).join(', ')
  return (
    <article className="page-prose">
      <h1>Integritetspolicy</h1>
      <p className="cell-muted">Gäller för bokningar och besök på {tenant.name}s webbplats.</p>

      {/* Restaurangens egen text (redigeras i admin) från en nyare backend;
          annars standardtexten nedan. Cookietabellen kommer alltid efter. */}
      {config.privacy ? <NoticeText body={config.privacy.notice.body} /> : (<>
      <h2>Personuppgiftsansvarig</h2>
      <p>
        {legal.legalName}
        {legal.orgNumber ? ` (org.nr ${legal.orgNumber})` : ''}
        {typeof legal.address === 'string' && legal.address ? `, ${legal.address}` : ''} ansvarar för behandlingen av dina personuppgifter.
        {contact ? ` Kontakt: ${contact}.` : ''}
      </p>

      <h2>Vilka uppgifter vi behandlar och varför</h2>
      <ul>
        <li>
          <strong>Bokning:</strong> namn, e-post, telefonnummer, antal gäster, datum och tid samt ditt
          eventuella meddelande (t.ex. allergier). Vi behöver uppgifterna för att ta emot och hantera din
          bokning och kontakta dig om den (rättslig grund: avtal).
        </li>
        <li>
          <strong>Meddelanden om bokningen:</strong> bekräftelse, påminnelse och ändringar skickas till din
          e-post och/eller ditt telefonnummer (avtal).
        </li>
        <li>
          <strong>Erbjudanden:</strong> bara om du har kryssat i det när du bokat, beställt eller skickat en
          cateringförfrågan, eller anmält dig till vårt välkomsterbjudande. Vi sparar då ditt namn, din e-post och
          när du senast besökte oss, för att skicka nyheter och erbjudanden via e-post. Varje utskick har en
          länk för att avsluta prenumerationen, och du kan när som helst ta tillbaka ditt samtycke (rättslig
          grund: samtycke). Vi ser om du klickar på en länk i ett utskick, men inte om du öppnar det.
        </li>
        {tenant.features?.marketing && (
          <li>
            <strong>Besöksstatistik:</strong> vi räknar hur många som besöker webbplatsen per dag och varifrån
            de kom (t.ex. Google, Instagram eller ett nyhetsbrev, men bara sajtens namn, aldrig adressen du var på). Inget sparas i din webbläsare och varken din
            IP-adress eller något id kopplat till dig sparas, så statistiken kan inte spåras till dig
            (rättslig grund: berättigat intresse).
          </li>
        )}
        <li>
          <strong>Allergier och liknande</strong> som du själv skriver i meddelandet används bara för att
          förbereda ditt besök.
        </li>
      </ul>

      <h2>Hur länge uppgifterna sparas</h2>
      <p>
        Bokningsuppgifter raderas automatiskt cirka 13 månader efter besöket, om inte lag (t.ex.
        bokföringslagen för betalningar) kräver att något sparas längre.
      </p>

      <h2>Vem uppgifterna delas med</h2>
      <p>
        Bokningssystemet levereras av IT Hjälparna Nordic AB, som behandlar uppgifterna för vår räkning
        (personuppgiftsbiträde) på servrar inom EU (Amazon Web Services, Stockholm). Om du betalar eller
        lämnar en kortgaranti hanteras kortuppgifterna av Stripe; vi ser aldrig ditt kortnummer. Vi säljer
        aldrig dina uppgifter.
      </p>
      </>)}

      <h2 id="cookies">Cookies och lagring</h2>
      <p>
        Webbplatsen använder inga cookies för statistik, spårning eller reklam. Det som sparas i din
        webbläsare behövs för det du själv gör här (välja plats, beställa, boka, betala), och därför
        frågar vi inte om samtycke. Så här ser det ut:
      </p>
      <div className="storage-table-wrap">
        <table className="storage-table">
          <thead>
            <tr>
              <th scope="col">Namn</th>
              <th scope="col">Vad det gör</th>
              <th scope="col">Sätts av</th>
              <th scope="col">Sparas</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Du kan rensa allt detta i webbläsarens inställningar. Då glöms bara vald plats och en
        eventuell varukorg; inget annat på sajten påverkas.
      </p>

      {/* Rättigheterna finns redan i restaurangens egen text. */}
      {!config.privacy && (<>
      <h2>Dina rättigheter</h2>
      <p>
        Du har rätt att få veta vilka uppgifter vi har om dig, få dem rättade eller raderade, begränsa
        behandlingen, invända och få ut dina uppgifter (dataportabilitet). Kontakta oss
        {contact ? ` på ${contact}` : ''}. Du kan också klaga hos Integritetsskyddsmyndigheten (IMY),
        www.imy.se.
      </p>
      </>)}
    </article>
  )
}
