// MOCK: bookings and the rows that hang off them (tables: bookings, booking_addons, payments, cancellations).
// Dates are relative to today so the demo always has past, today's and upcoming appointments.

import { dateFromToday, minutesFromNow } from '../../lib/dates'

const daysAgo = (days, hour = 9) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function booking(id, clientId, serviceId, servicePrice, dayOffset, startTime, status, note, createdDaysAgo) {
  const createdAt = daysAgo(createdDaysAgo)
  return { id, clientId, serviceId, servicePrice, depositAmount: 150, bookingDate: dateFromToday(dayOffset), startTime,
    noteForLeah: note, status, createdAt, updatedAt: createdAt, reminderSentAt: null, isDeleted: false }
}

export const bookings = [
  booking(1, 2, 2, 400, -12, '10:00:00', 'Completed', 'FirstVisit', 15),
  booking(2, 3, 1, 300, -9, '12:00:00', 'Completed', 'None', 11),
  booking(3, 4, 3, 250, -6, '14:00:00', 'Completed', 'KeepNailsShort', 8),
  booking(4, 2, 1, 300, -3, '16:00:00', 'Completed', 'None', 5),
  booking(5, 3, 2, 400, -1, '10:00:00', 'Cancelled', 'BringingReferencePhoto', 4),
  booking(6, 3, 1, 300, 0, '12:00:00', 'Confirmed', 'None', 3),
  booking(7, 4, 5, 150, 0, '14:00:00', 'Confirmed', 'SensitiveSkin', 2),
  booking(8, 2, 2, 400, 1, '10:00:00', 'Confirmed', 'KeepNailsLong', 2),
  booking(9, 4, 3, 250, 2, '16:00:00', 'Pending', 'FirstVisit', 0),
  booking(10, 2, 1, 300, 5, '12:00:00', 'Confirmed', 'None', 1),
  booking(11, 3, 2, 400, 7, '14:00:00', 'Cancelled', 'None', 1),
]

/** Add-on lines. linePrice is what was charged at booking time (price × nails). */
export const bookingAddOns = [
  { id: 1, bookingId: 1, addOnId: 1, nailCount: 10, linePrice: 150 },
  { id: 2, bookingId: 1, addOnId: 2, nailCount: 2, linePrice: 20 },
  { id: 3, bookingId: 3, addOnId: 3, nailCount: 4, linePrice: 40 },
  { id: 4, bookingId: 8, addOnId: 5, nailCount: 2, linePrice: 30 },
  { id: 5, bookingId: 10, addOnId: 4, nailCount: 3, linePrice: 30 },
]

const payment = (id, bookingId, method, paidDaysAgo) => ({
  id, bookingId, method, amount: 150, status: 'Succeeded',
  referenceNumber: `${method === 'GCash' ? 'GC' : 'MY'}-DEMO-${String(id).padStart(6, '0')}`,
  idempotencyKey: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  paidAt: daysAgo(paidDaysAgo, 10),
})

export const payments = [
  payment(1, 1, 'GCash', 15),
  payment(2, 2, 'Maya', 11),
  payment(3, 3, 'GCash', 8),
  payment(4, 4, 'GCash', 5),
  payment(5, 5, 'Maya', 4),
  payment(6, 6, 'GCash', 3),
  payment(7, 7, 'Maya', 2),
  payment(8, 8, 'GCash', 2),
  // Booking 9 is Pending: the e-wallet payment arrived but has not been confirmed yet.
  payment(9, 9, 'GCash', 0),
  payment(10, 10, 'Maya', 1),
  payment(11, 11, 'GCash', 1),
]

export const cancellations = [
  { id: 1, bookingId: 5, cancelledByUserId: 3, reason: 'ChangeOfSchedule', explanation: null, cancelledAt: daysAgo(2) },
  { id: 2, bookingId: 11, cancelledByUserId: 1, reason: 'StaffUnavailable', explanation: 'Leah has a training seminar that day.', cancelledAt: minutesFromNow(-180) },
]
