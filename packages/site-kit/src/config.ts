/**
 * Sajtens inställningar för site-kit: var API:t finns, vilken restaurang
 * localhost visar, var menybilderna ligger och vilka typsnittsfiler Stripes
 * betalformulär laddar. Sajten anropar configureSiteKit en gång i main.tsx
 * innan den renderar (värdena kommer från sajtens VITE_-variabler). Inget
 * här är hemligt: allt hamnar i den publika bundeln.
 */
export interface SiteKitConfig {
  /** API Gateway (eller `/api` bakom dev-proxyn). Utan den visas sajten som otillgänglig. */
  apiBaseUrl?: string
  /** Restaurangen som localhost och *.cloudfront.net visar (aldrig i prod). */
  devTenantSlug?: string
  /** CDN för menybilder; API:t ger bara S3-nyckeln. */
  menuImageBaseUrl?: string
  /** Sajtens typsnittsfiler (woff2-URL:er) för Stripes iframes. */
  paymentFonts?: { sans?: string; mono?: string }
}

let current: SiteKitConfig = {}

export function configureSiteKit(config: SiteKitConfig): void {
  current = { ...current, ...config }
}

export function siteKitConfig(): Readonly<SiteKitConfig> {
  return current
}
