import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SiteProvider, configureSiteKit, installSound } from '@booqy/site-kit'
import archivoUrl from './assets/fonts/archivo.woff2?url'
import martianUrl from './assets/fonts/martian-mono.woff2?url'
import App from './App'
import '@booqy/site-kit/styles.css'
import './index.css'
import './site.css'

configureSiteKit({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
  devTenantSlug: import.meta.env.VITE_DEV_TENANT_SLUG as string | undefined,
  menuImageBaseUrl: import.meta.env.VITE_MENU_IMAGE_BASE_URL as string | undefined,
  paymentFonts: { sans: archivoUrl, mono: martianUrl },
})

installSound()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SiteProvider>
        <App />
      </SiteProvider>
    </BrowserRouter>
  </StrictMode>,
)
