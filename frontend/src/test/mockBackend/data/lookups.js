// Test data: the same lists as GET /api/lookups on the backend (backend/Domain/Labels.cs).

export const lookups = {
  // One-tap additions to the typed note for Leyah.
  noteSuggestions: ['This is my first visit', "I'll bring a reference photo", 'Please keep my nails short', "I'd like long nails",
    'I have sensitive skin or allergies'],
  clientCancellationReasons: [
    { value: 'ChangeOfSchedule', label: 'Change of schedule' },
    { value: 'Emergency', label: 'Emergency' },
    { value: 'BookedByMistake', label: 'Booked by mistake' },
    { value: 'FoundAnotherProvider', label: 'Found another provider' },
    { value: 'Others', label: 'Others' },
  ],
  adminCancellationReasons: [
    { value: 'StaffUnavailable', label: 'Staff unavailable' },
    { value: 'ScheduleConflict', label: 'Schedule conflict' },
    { value: 'Emergency', label: 'Emergency' },
    { value: 'ClientDidNotRespond', label: 'Client did not respond' },
    { value: 'Others', label: 'Others' },
  ],
  paymentMethods: [
    { value: 'GCash', label: 'GCash' },
    { value: 'Maya', label: 'Maya' },
  ],
  bookingStatuses: [
    { value: 'Pending', label: 'Pending' },
    { value: 'Confirmed', label: 'Confirmed' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' },
  ],
  termsVersion: '2.3',
}

const allReasons = [...lookups.clientCancellationReasons, ...lookups.adminCancellationReasons]

export const reasonLabel = (value) => allReasons.find((o) => o.value === value)?.label ?? value
