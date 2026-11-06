import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(() => {
  // The C# API in Visual Studio (https profile).
  const apiTarget = 'https://localhost:7199'

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Forward API calls to the ASP.NET Core backend (https profile; the API redirects plain HTTP).
        // secure: false accepts the local ASP.NET Core development certificate.
        '/api': { target: apiTarget, secure: false },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      // Long flows (a whole booking) can't finish in the default 5 seconds on a busy machine. These are limits,
      // not delays: a passing test takes no longer because of them.
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  }
})
