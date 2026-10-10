import { useSite } from '../../shared/SiteContext'

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

      <h2>Personuppgiftsansvarig</h2>
      <p>
        {legal.legalName}
        {legal.orgNumber ? ` (org.nr ${legal.orgNumber})` : ''}
        {legal.address ? `, ${legal.address}` : ''} ansvarar för behandlingen av dina personuppgifter.
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
          <strong>Erbjudanden:</strong> bara om du har kryssat i det. Du kan när som helst ta tillbaka ditt
          samtycke (rättslig grund: samtycke).
        </li>
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

      <h2>Cookies och lagring</h2>
      <p>
        Webbplatsen använder inga spårnings- eller reklamcookies. Den sparar bara vilken av våra
        restauranger du har valt i din webbläsare, för att sidan ska fungera.
      </p>

      <h2>Dina rättigheter</h2>
      <p>
        Du har rätt att få veta vilka uppgifter vi har om dig, få dem rättade eller raderade, begränsa
        behandlingen, invända och få ut dina uppgifter (dataportabilitet). Kontakta oss
        {contact ? ` på ${contact}` : ''}. Du kan också klaga hos Integritetsskyddsmyndigheten (IMY),
        www.imy.se.
      </p>
    </article>
  )
}
