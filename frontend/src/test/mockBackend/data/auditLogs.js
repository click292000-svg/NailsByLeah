// MOCK: activity log (table: audit_logs). New entries are added as you use the app.

import { minutesFromNow } from '../../../lib/dates'

export const auditLogs = [
  { id: 1, userId: 1, action: 'ServiceUpdated', entityType: 'Service', entityId: '3', details: "'BIAB' -> 'BIAB', PHP 230.00 -> 250.00, active True -> True", ipAddress: '127.0.0.1', createdAt: minutesFromNow(-60 * 24 * 9) },
  { id: 2, userId: 1, action: 'SlotBlocked', entityType: 'BlockedSlot', entityId: '1', details: 'Whole day blocked', ipAddress: '127.0.0.1', createdAt: minutesFromNow(-60 * 24 * 8) },
  { id: 3, userId: 3, action: 'BookingCancelled', entityType: 'Booking', entityId: '5', details: 'Reason: Change of schedule. The deposit is non-refundable.', ipAddress: '127.0.0.1', createdAt: minutesFromNow(-60 * 48) },
  { id: 4, userId: 4, action: 'BookingCreated', entityType: 'Booking', entityId: '9', details: 'BIAB, total PHP 250.00', ipAddress: '127.0.0.1', createdAt: minutesFromNow(-90) },
  { id: 5, userId: 1, action: 'BookingCancelled', entityType: 'Booking', entityId: '11', details: 'Reason: Leyah is not available. Refund due: PHP 150.00.', ipAddress: '127.0.0.1', createdAt: minutesFromNow(-180) },
  { id: 6, userId: 2, action: 'LoginSucceeded', entityType: 'User', entityId: '2', details: null, ipAddress: '127.0.0.1', createdAt: minutesFromNow(-30) },
]
