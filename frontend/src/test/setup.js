import '@testing-library/jest-dom/vitest'
import { resetDb } from './mockBackend/db'

// The website always talks to the real C# API. The automated tests swap in the test-only backend in
// ./mockBackend (same endpoints, rules and responses) so they run without a server or a database.
vi.mock('../api/http', async () => {
  const { mockRequest } = await import('./mockBackend/mockApi')
  return { httpRequest: mockRequest }
})

// Every test starts from the original test data and signed out.
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  resetDb()
})
