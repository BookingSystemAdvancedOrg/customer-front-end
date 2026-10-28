/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Allt som sajten själv installerar (peer) eller som site-kit drar in
// (dependencies) byggs inte in i paketet.
const external = [...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.dependencies)]

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Inga VITE_-variabler bakas in i paketet: sajten ger sina värden via
  // configureSiteKit.
  envPrefix: 'SITE_KIT_BUILD_',
  cacheDir: mode === 'test' ? 'node_modules/.vitest' : 'node_modules/.vite',
  build: {
    lib: {
      entry: { index: 'src/index.ts', testing: 'src/testing.ts', styles: 'src/styles.ts' },
      formats: ['es'],
      cssFileName: 'site-kit',
    },
    sourcemap: true,
    rolldownOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
}))
