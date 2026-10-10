import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { SiteContext } from '../shared/SiteContext'
import type { SiteConfig } from '../shared/site'
import { siteConfig } from './siteData'

export function WithSite({
  children,
  config = siteConfig(),
  path = '/',
}: {
  children: ReactNode
  config?: SiteConfig
  path?: string
}) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <SiteContext.Provider value={{ config, location: config.locations[0], setLocationId: () => {} }}>
        {children}
      </SiteContext.Provider>
    </MemoryRouter>
  )
}

