/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// The apps install React themselves (peer): never bundled into the package.
const external = Object.keys(pkg.peerDependencies)

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  envPrefix: 'BRAND_BUILD_',
  define: { __BRAND_VERSION__: JSON.stringify(pkg.version) },
  cacheDir: mode === 'test' ? 'node_modules/.vitest' : 'node_modules/.vite',
  build: {
    lib: {
      entry: { index: 'src/index.ts', styles: 'src/styles.ts' },
      formats: ['es'],
      cssFileName: 'brand',
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
