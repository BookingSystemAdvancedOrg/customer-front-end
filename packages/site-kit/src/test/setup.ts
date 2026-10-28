import '@testing-library/jest-dom/vitest'
import { configureSiteKit } from '../config'

configureSiteKit({
  apiBaseUrl: 'https://api.test',
  paymentFonts: { sans: '/assets/archivo.woff2', mono: '/assets/martian-mono.woff2' },
})

// jsdom has no ResizeObserver (the header measures its height with it).
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
}
