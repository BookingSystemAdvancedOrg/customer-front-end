import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// booqy.se is plain HTML with no build step: one classic script
// (window.BooqyBrand) and one stylesheet, both copied with the version in
// their names (docs/adr/ADR-BRAND-sharing.md).
export default defineConfig({
  envPrefix: 'BRAND_BUILD_',
  define: { __BRAND_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist/static',
    emptyOutDir: true,
    lib: {
      entry: 'src/static.ts',
      formats: ['iife'],
      name: 'BooqyBrand',
      fileName: () => `brand-static-${pkg.version}.js`,
      cssFileName: `brand-static-${pkg.version}`,
    },
    minify: true,
  },
})
