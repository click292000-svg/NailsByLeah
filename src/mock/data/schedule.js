// MOCK: blocked dates and slots (table: blocked_slots). startTime null = the whole day is blocked.

import { dateFromToday } from '../../lib/dates'

export const blockedSlots = [
  { id: 1, date: dateFromToday(6), startTime: null, reason: "Leah's day off", createdByUserId: 1, createdAt: '2026-10-20T01:00:00.000Z', isDeleted: false },
  { id: 2, date: dateFromToday(4), startTime: '16:00:00', reason: 'Supplies delivery', createdByUserId: 1, createdAt: '2026-10-20T01:05:00.000Z', isDeleted: false },
]
