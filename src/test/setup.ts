import '@testing-library/jest-dom/vitest'
import { configureSiteKit } from '@booqy/site-kit'

configureSiteKit({ apiBaseUrl: 'https://api.test' })

// jsdom has no ResizeObserver (the header measures its height with it).
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
}
