// In-browser "database" for the mock backend. It starts from the files in ./data, and every
// change is saved to localStorage so bookings survive a page reload. "Reset demo data" in the
// Mock inbox panel (or resetDb()) restores the original data.

import { users } from './data/users'
import { services, addOns } from './data/services'
import { bookings, bookingAddOns, payments, cancellations } from './data/bookings'
import { blockedSlots } from './data/schedule'
import { userTokens } from './data/tokens'
import { auditLogs } from './data/auditLogs'

const STORAGE_KEY = 'nailsbyleah.mockdb.v1'

function seed() {
  return structuredClone({
    users, services, addOns, bookings, bookingAddOns, payments, cancellations, blockedSlots, userTokens, auditLogs,
    /** Emails the real backend would send. Shown in the Mock inbox panel. */
    outbox: [],
    /** Switches for testing error paths from the Mock inbox panel. */
    flags: { failNextPayment: false },
  })
}

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // Storage unavailable (private mode) or corrupt: start fresh.
  }
  return seed()
}

let state = load()
const listeners = new Set()

export const getDb = () => state

export function saveDb() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore: the data still lives in memory for this tab.
  }
  listeners.forEach((listener) => listener())
}

export function resetDb() {
  state = seed()
  saveDb()
}

/** Re-render hook support for the Mock inbox panel. */
export function subscribeDb(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function nextId(table) {
  return state[table].reduce((max, row) => Math.max(max, row.id), 0) + 1
}
