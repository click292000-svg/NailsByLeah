import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { resetDb } from './mockBackend/db'

// How long findBy and waitFor keep looking. The default of 1 second is too short when the machine is busy, which made
// tests fail at random. It is only a limit: they carry on as soon as what they are waiting for appears.
configure({ asyncUtilTimeout: 10_000 })

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
