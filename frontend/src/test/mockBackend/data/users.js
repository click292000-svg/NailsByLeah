// MOCK: user accounts (table: users).
// Demo logins are shown on the Login page while mock mode is on.
// The mock keeps passwords in plain text for convenience only; the real backend stores bcrypt hashes.

const createdAt = '2026-10-01T02:00:00.000Z'

const base = {
  emailVerified: true,
  termsVersion: '1.0',
  termsAcceptedAt: createdAt,
  failedLoginCount: 0,
  lockoutEndUtc: null,
  createdAt,
  updatedAt: createdAt,
  isDeleted: false,
}

export const users = [
  { ...base, id: 1, firstName: 'Leyah', lastName: 'Reyes', username: 'leah', email: 'leah@nailsbyleah.test',
    phoneNumber: '09170000001', password: 'AdminPass123', role: 'Administrator', securityStamp: 'stamp-1', termsVersion: null, termsAcceptedAt: null },
  { ...base, id: 2, firstName: 'Kyla', lastName: 'Santos', username: 'kyla', email: 'kyla@example.test',
    phoneNumber: '09171234567', password: 'ClientPass123', role: 'Client', securityStamp: 'stamp-2' },
  { ...base, id: 3, firstName: 'Maria', lastName: 'Dela Cruz', username: 'maria.dc', email: 'maria@example.test',
    phoneNumber: '09181112222', password: 'ClientPass123', role: 'Client', securityStamp: 'stamp-3' },
  { ...base, id: 4, firstName: 'Ana', lastName: 'Lim', username: 'ana_lim', email: 'ana@example.test',
    phoneNumber: '09193334444', password: 'ClientPass123', role: 'Client', securityStamp: 'stamp-4' },
  { ...base, id: 5, firstName: 'Joy', lastName: 'Garcia', username: 'joy.unverified', email: 'joy@example.test',
    phoneNumber: '09205556666', password: 'ClientPass123', role: 'Client', securityStamp: 'stamp-5', emailVerified: false },
]

/** Accounts listed on the Login page in mock mode. */
export const demoAccounts = [
  { label: 'Administrator (Leyah)', username: 'leah', password: 'AdminPass123' },
  { label: 'Client (Kyla)', username: 'kyla', password: 'ClientPass123' },
]
