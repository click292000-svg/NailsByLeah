import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the ASP.NET Core backend (https profile; the API redirects plain HTTP).
      // secure: false accepts the local ASP.NET Core development certificate.
      '/api': { target: 'https://localhost:7199', secure: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Tests always use the mock backend, with no artificial delay.
    env: { VITE_USE_MOCK_API: 'true', VITE_MOCK_LATENCY_MS: '0' },
  },
})
