// MOCK: salon details and policies. Replace the placeholder address and coordinates with the real ones.

export const salon = {
  name: 'Nails by Leah',
  addressLines: ['Unit 2B, Placeholder Building', '123 Sample Street, Barangay Example', 'Quezon City, Metro Manila 1100'],
  // Placeholder pin (Quezon City Memorial Circle). Replace with the salon's exact coordinates.
  latitude: 14.6516,
  longitude: 121.0493,
  phone: '0917 000 0000',
  hours: 'Open daily, 10:00 AM – 6:00 PM',
}

/** Same values as the backend "Schedule" settings. */
export const schedule = {
  openingTime: '10:00:00',
  closingTime: '18:00:00',
  slotMinutes: 120,
  maxDaysAhead: 60,
  closedDaysOfWeek: [], // 0 = Sunday … 6 = Saturday
}

/** Same values as the backend "Auth" and "Booking" settings. */
export const policies = {
  depositAmount: 150,
  rescheduleMinimumHours: 24,
  maxFailedLoginAttempts: 5,
  lockoutMinutes: 15,
  sessionIdleMinutes: 30,
  passwordResetTokenMinutes: 15,
  emailVerificationCodeHours: 24,
  maxVerificationAttempts: 5,
  termsVersion: '1.0',
}
