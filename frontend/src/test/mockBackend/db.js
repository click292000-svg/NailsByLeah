// In-memory "database" for the test-only backend (./mockApi.js). It starts from the files in ./data;
// every test calls resetDb() (src/test/setup.js) so each one starts from the same data.

import { users } from './data/users'
import { services, addOns } from './data/services'
import { bookings, bookingAddOns, payments, cancellations } from './data/bookings'
import { blockedSlots } from './data/schedule'
import { schedule } from '../../content/salon'
import { addMinutesToTime } from '../../lib/dates'
import { userTokens } from './data/tokens'
import { auditLogs } from './data/auditLogs'

const STORAGE_KEY = 'nailsbyleah.mockdb.v1'

function seed() {
  return structuredClone({
    users, services, addOns, bookings, bookingAddOns, payments, cancellations, blockedSlots, userTokens, auditLogs,
    /** The single salon_settings row: the closing time administrators set. */
    salonSettings: { closingTime: schedule.defaultClosingTime, updatedAt: '2026-11-02T00:00:00.000Z', updatedByUserId: null },
    /** Design photos; each row keeps the image itself as a data: URL. */
    referenceImages: [],
    /** One unfinished booking per client: { id, clientId, data, updatedAt }. */
    bookingDrafts: [],
    /** Star ratings from clients. */
    feedback: [
      { id: 1, clientId: 2, rating: 5, comment: 'Love my chrome French tips, so neat!', submissionKey: 'seed-1', createdAt: '2026-10-28T09:12:00.000Z' },
      { id: 2, clientId: 3, rating: 4, comment: null, submissionKey: 'seed-2', createdAt: '2026-10-30T11:40:00.000Z' },
      { id: 3, clientId: 4, rating: 5, comment: 'Very gentle removal and a lovely design.', submissionKey: 'seed-3', createdAt: '2026-11-01T07:05:00.000Z' },
    ],
    /** Emails the real backend would send. Shown in the Mock inbox panel. */
    outbox: [],
    /** Switches for testing error paths from the Mock inbox panel. */
    flags: { failNextPayment: false },
  })
}

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    // Tables added after the data was first saved start from the seed.
    if (saved) return upgrade({ ...seed(), ...JSON.parse(saved) })
  } catch {
    // Storage unavailable (private mode) or corrupt: start fresh.
  }
  return seed()
}

/**
 * Fills in fields added after demo data was saved in this browser, the same way the database migration
 * does: services get their seeded length (else 60 minutes), older bookings were 2-hour slots, and older
 * single blocked slots covered one 2-hour slot.
 */
function upgrade(data) {
  const seededDurations = Object.fromEntries(services.map((s) => [s.id, s.durationMinutes]))
  for (const s of data.services) s.durationMinutes ??= seededDurations[s.id] ?? 60
  for (const b of data.bookings) b.durationMinutes ??= 120
  for (const b of data.blockedSlots) b.endTime ??= b.startTime === null ? null : addMinutesToTime(b.startTime, 120)
  // Add-ons booked before hands were asked for count as both hands.
  for (const line of data.bookingAddOns) line.hand ??= 'Both'
  // Bookings made before the payment option existed were paid by deposit.
  for (const b of data.bookings) { b.paymentOption ??= 'Deposit'; b.amountPaid ??= b.depositAmount }
  for (const p of data.payments) p.option ??= 'Deposit'
  return data
}

let state = load()
const listeners = new Set()

// Another tab changed the data (e.g. the salon replied in an admin tab): pick it up here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    state = load()
    listeners.forEach((listener) => listener())
  })
}

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
