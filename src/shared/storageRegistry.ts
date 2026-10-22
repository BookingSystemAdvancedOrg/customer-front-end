/**
 * Allt som restaurangens webbplats sparar i gästens webbläsare, på ett
 * ställe, inklusive det tredje parter (Stripe, Cloudflare) sätter.
 *
 * Det här är facit: koden hämtar sina nyckelnamn härifrån, integritets-
 * policyns tabell ritas härifrån, och ett test (storageRegistry.test.ts)
 * underkänner kod som skriver till lagring utan att gå via den här filen.
 * Lägger du till något: lägg till det här först.
 *
 * Samtyckesbanner: behövs inte. Allt nedan är strikt nödvändigt för en
 * tjänst gästen själv bett om (bokning, beställning, betalning, skydd mot
 * bedrägeri och robotar) eller ett val gästen själv gjort, vilket är
 * undantaget i lagen om elektronisk kommunikation 9 kap. 28 §. Inga
 * analys- eller marknadsföringscookies. Lägger någon till sådana måste det
 * här omprövas först: då krävs samtycke innan de sätts.
 */

export type StorageKind = 'cookie' | 'localStorage' | 'sessionStorage' | 'ingen'
export type StorageCategory = 'nödvändig' | 'funktionell' | 'analys' | 'marknadsföring'

export interface StorageEntry {
  /** Namnet i webbläsaren; {x} står för en del som varierar. */
  name: string
  kind: StorageKind
  setBy: string
  purpose: string
  lifetime: string
  category: StorageCategory
  /** Var på sajten den förekommer, om inte överallt. */
  where?: string
}

export const LOCATION_KEY_PREFIX = 'site-location:'
export const SLUG_KEY = 'site-tenant-slug'
export const CART_KEY_PREFIX = 'order-cart:'
export const TABLE_KEY = 'order-table-code'
export const ORDER_TOKEN_PREFIX = 'order-token:'
export const CATERING_TOKEN_PREFIX = 'catering-token:'
export const OFFER_CARD_KEY = 'offer-card'
export const THEME_KEY = 'booqy-theme'

export const STORAGE_REGISTRY: readonly StorageEntry[] = [
  {
    name: `${LOCATION_KEY_PREFIX}{restaurang}`,
    kind: 'localStorage',
    setBy: 'Webbplatsen',
    purpose: 'Vilken av restaurangens platser du har valt.',
    lifetime: 'Tills du rensar webbläsaren',
    category: 'nödvändig',
  },
  {
    name: THEME_KEY,
    kind: 'localStorage',
    setBy: 'Webbplatsen',
    purpose: 'Ditt val av ljust eller mörkt läge (knappen i sidhuvudet). Sätts bara om du trycker på den; annars följer sidan din enhets inställning.',
    lifetime: 'Tills du rensar webbläsaren',
    category: 'nödvändig',
  },
  {
    name: `${CART_KEY_PREFIX}{plats}`,
    kind: 'sessionStorage',
    setBy: 'Webbplatsen',
    purpose: 'Din varukorg, så att den finns kvar om du avbryter betalningen.',
    lifetime: 'Tills fliken stängs',
    category: 'nödvändig',
    where: 'Beställning',
  },
  {
    name: TABLE_KEY,
    kind: 'sessionStorage',
    setBy: 'Webbplatsen',
    purpose: 'Bordet från QR-koden du skannade, så att beställningen kommer till rätt bord.',
    lifetime: 'Tills fliken stängs',
    category: 'nödvändig',
    where: 'Beställning vid bordet',
  },
  {
    name: `${ORDER_TOKEN_PREFIX}{beställning}`,
    kind: 'sessionStorage',
    setBy: 'Webbplatsen',
    purpose: 'Låter dig följa din beställning när du kommer tillbaka från betalningen.',
    lifetime: 'Tills fliken stängs',
    category: 'nödvändig',
    where: 'Beställning',
  },
  {
    name: `${CATERING_TOKEN_PREFIX}{förfrågan}`,
    kind: 'sessionStorage',
    setBy: 'Webbplatsen',
    purpose: 'Låter dig se och signera din cateringoffert från länken i mejlet.',
    lifetime: 'Tills fliken stängs',
    category: 'nödvändig',
    where: 'Catering',
  },
  {
    name: SLUG_KEY,
    kind: 'sessionStorage',
    setBy: 'Webbplatsen',
    purpose: 'Vilken restaurang som visas på en förhandsvisningsadress (inte på restaurangens egen domän).',
    lifetime: 'Tills fliken stängs',
    category: 'nödvändig',
    where: 'Förhandsvisning',
  },
  {
    name: '__stripe_mid, __stripe_sid',
    kind: 'cookie',
    setBy: 'Stripe (betaltjänst)',
    purpose: 'Skydd mot kortbedrägerier när du betalar eller lämnar en kortgaranti. Sätts bara på de stegen.',
    lifetime: '1 år respektive 30 minuter',
    category: 'nödvändig',
    where: 'Kortgaranti, betalning av beställning och catering',
  },
  {
    name: 'Cloudflare Turnstile',
    kind: 'ingen',
    setBy: 'Cloudflare',
    purpose: 'Kontrollerar att en bokning, beställning eller förfrågan görs av en människa och inte en robot. Sätter inga cookies.',
    lifetime: '-',
    category: 'nödvändig',
    where: 'Bokning, beställning, catering och välkomsterbjudandet',
  },
  {
    name: OFFER_CARD_KEY,
    kind: 'sessionStorage',
    setBy: 'Webbplatsen',
    purpose: 'Att du har stängt eller tagit välkomsterbjudandet, så att det inte visas igen under besöket. Sparas bara när du själv gör något av det.',
    lifetime: 'Tills fliken stängs',
    category: 'nödvändig',
    where: 'Välkomsterbjudande',
  },
  {
    name: 'Besöksstatistik',
    kind: 'ingen',
    setBy: 'Webbplatsen',
    purpose: 'Räknar sidvisningar per dag och var besökare kom ifrån (t.ex. Google eller ett nyhetsbrev), så att restaurangen ser vad som ger bokningar. Sparar ingenting i din webbläsare, inget besökar-id och ingen IP-adress.',
    lifetime: '-',
    category: 'nödvändig',
  },
]
