import '@testing-library/jest-dom/vitest'
import { resetDb } from '../mock/db'

// Every test starts from the original mock data and signed out.
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  resetDb()
})
