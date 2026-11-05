import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource-variable/inter'
import '@fontsource-variable/playfair-display'
import './styles/app.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// Production pages are always served over HTTPS (Ref 8.5). Local development stays on http://localhost.
const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
if (import.meta.env.PROD && window.location.protocol === 'http:' && !isLocalhost) {
  window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`)
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
}
