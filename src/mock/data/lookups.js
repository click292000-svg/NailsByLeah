// MOCK: dropdown options, matching GET /api/lookups on the backend (backend/Domain/Labels.cs).
// The "Note for Leah" options are placeholders until the final list is confirmed.

export const lookups = {
  noteForLeahOptions: [
    { value: 'None', label: 'No note' },
    { value: 'FirstVisit', label: 'This is my first visit' },
    { value: 'BringingReferencePhoto', label: "I'll bring a reference photo" },
    { value: 'KeepNailsShort', label: 'Please keep my nails short' },
    { value: 'KeepNailsLong', label: "I'd like long nails" },
    { value: 'SensitiveSkin', label: 'I have sensitive skin or allergies' },
  ],
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
  termsVersion: '1.0',
}

const allReasons = [...lookups.clientCancellationReasons, ...lookups.adminCancellationReasons]

export const noteLabel = (value) => lookups.noteForLeahOptions.find((o) => o.value === value)?.label ?? value
export const reasonLabel = (value) => allReasons.find((o) => o.value === value)?.label ?? value
