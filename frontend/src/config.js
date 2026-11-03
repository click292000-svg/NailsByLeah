// All runtime configuration comes from Vite environment variables (.env files), never hard-coded (Ref 14.3).
// See .env.example for the full list.

const env = import.meta.env

function readNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && value !== '' && value !== undefined ? number : fallback
}

export const config = {
  /** Base URL of the C# API. Relative by default so the Vite dev proxy (and same-origin hosting) is used. */
  apiBaseUrl: env.VITE_API_BASE_URL || '/api',

  /** Optional. Without a key the keyless Google Maps embed is used. */
  googleMapsApiKey: env.VITE_GOOGLE_MAPS_API_KEY || '',

  /** Idle time before automatic logout (Ref 8.4). */
  sessionIdleMinutes: readNumber(env.VITE_SESSION_IDLE_MINUTES, 30),
}
