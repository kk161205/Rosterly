import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // On Vercel, a build without the API address would silently call Vercel itself — fail loudly instead.
  const env = loadEnv(mode, process.cwd(), '')
  if (process.env.VERCEL && mode === 'production' && !env.VITE_API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not set for this Vercel build (it is read at build time).')
  }
  return {
  plugins: [react()],
  // Build files go to /static, so app routes like /assets/123 never clash with them.
  build: { assetsDir: 'static' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Default 5000ms test / hook timeouts left occasional headroom-starved
    // failures under load (all 7 files' jsdom environments + workers
    // competing for CPU) — a test that always passes in isolation but
    // intermittently timed out in the full run. Raised, not to mask a real
    // bug (a logic error still fails regardless of timeout), just to stop
    // system load from being mistaken for one.
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  server: {
    port: 5173,
  },
  }
})
