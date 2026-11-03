import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One SSR bundle of site-kit's SitePage (the same component the browser draws)
// plus React, so the Lambda image needs no node_modules.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    ssr: 'src/entry.tsx',
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { format: 'es', entryFileNames: 'entry.mjs' } },
  },
  ssr: { noExternal: true, target: 'node' },
})
