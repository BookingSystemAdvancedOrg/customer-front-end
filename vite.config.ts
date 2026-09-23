/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_BASE_URL ?? ''
  // I dev proxas API-anropen genom dev-servern (samma origin) i stället för
  // att webbläsaren pratar direkt med API Gateway - samma mönster som
  // admin-front-end. Bygget påverkas inte: där används VITE_API_BASE_URL
  // från .env / project.env som vanligt.
  const useDevProxy = mode === 'development' && /^https?:/.test(apiTarget)

  return {
    plugins: [
      react(),
      {
        // CSP:n i index.html är skriven för den byggda sajten. Vites dev-läge
        // behöver inline-skript (React refresh-preamble) och blob-workers som
        // den policyn med rätta förbjuder, så i dev tas meta-taggen bort.
        // Bygget (npm run build) behåller den strikta policyn orörd.
        name: 'strip-csp-in-dev',
        apply: 'serve',
        transformIndexHtml(html) {
          return html.replace(
            /\s*<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
            '',
          )
        },
      },
    ],
    cacheDir: mode === 'test' ? 'node_modules/.vitest' : 'node_modules/.vite',
    define: useDevProxy
      ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') }
      : {},
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      globals: true,
    },
    server: {
      // 7070 är admin-appens port på den här datorn - kundappen kör 7071 så
      // att båda kan vara igång samtidigt. strictPort så att dev-servern inte
      // tyst byter port.
      port: 7071,
      strictPort: true,
      proxy: useDevProxy
        ? {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          }
        : undefined,
    },
  }
})
