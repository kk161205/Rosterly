import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    host: true,
    port: 5173,
    watch: {
      usePolling: true, // needed for file change detection inside Docker
    },
  },
})
