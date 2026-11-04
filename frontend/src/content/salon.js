// Salon details and policies. The phone number is still a placeholder.

export const salon = {
  name: 'Nails by Leyah',
  addressLines: ['201 Mabuhay Compound', 'Sauyo Road, Quezon City'],
  // The map pin is found by this address (the same search as Leyah's Google Maps link);
  // the coordinates are where that search centres, used to frame the map.
  mapQuery: '201 Mabuhay Compound Sauyo Road, QC',
  latitude: 14.6935373,
  longitude: 121.0428484,
  phone: '0917 000 0000',
  // Leyah's real social media profiles.
  social: {
    facebook: 'https://www.facebook.com/profile.php?id=61585816943665',
    instagram: 'https://www.instagram.com/_franciscaleah/',
    instagramHandle: '@_franciscaleah',
  },
}

/** Same values as the backend "Schedule" settings. */
export const schedule = {
  // Official opening time: no appointment starts earlier.
  openingTime: '11:00:00',
  // Starting closing time. Administrators change it on the Schedule page (stored in the salonSettings table).
  defaultClosingTime: '21:00:00',
  // Start times every 30 minutes from opening (11:00, 11:30, ...).
  slotIntervalMinutes: 30,
  // Mandatory break after every appointment's scheduled end before the next one may begin.
  bufferMinutes: 30,
  maxDaysAhead: 30,
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
