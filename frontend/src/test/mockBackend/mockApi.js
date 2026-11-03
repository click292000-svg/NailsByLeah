// Test-only stand-in for the C# API, used by the automated tests (src/test) so they run without a server or
// database. It implements the same endpoints, rules, response shapes and error codes as backend/Controllers,
// against the in-memory data in ./db.js. It is not part of the website: the app always talks to the real API.

import { ApiError } from '../../api/errors'
import { getDb, saveDb, nextId } from './db'
import { schedule, policies } from '../../content/salon'
import { lookups, reasonLabel } from './data/lookups'
import { categoryLabels } from './data/services'
import * as rules from '../../validation/rules'
import { calculateQuote } from '../../lib/pricing'
import { addDays, addMinutesToTime, daysInMonth, startsAt, today, toIsoDate } from '../../lib/dates'

const SESSION_KEY = 'nailsbyleah.mocksession'
const MINUTE = 60_000

// ---------------------------------------------------------------- helpers

const fail = (status, message, code = null, errors = {}) => {
  throw new ApiError({ status, message, code, errors })
}
const invalid = (field, message, code = null) => fail(400, message, code, { [field]: [message] })
const invalidMany = (errors) =>
  fail(400, 'One or more fields are invalid.', null,
    Object.fromEntries(Object.entries(errors).map(([field, message]) => [field, [message]])))
const notFound = (message) => fail(404, message, 'not_found')
const conflict = (message, code) => fail(409, message, code)

const nowIso = () => new Date().toISOString()
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const randomHex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
const sixDigitCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')

function audit(db, userId, action, entityType, entityId, details = null) {
  db.auditLogs.push({ id: nextId('auditLogs'), userId, action, entityType, entityId: entityId == null ? null : String(entityId),
    details, ipAddress: '127.0.0.1', createdAt: nowIso() })
}

function sendEmail(db, to, subject, body, extra = {}) {
  db.outbox.unshift({ id: nextId('outbox'), to, subject, body, createdAt: nowIso(), ...extra })
}

// ---------------------------------------------------------------- session (stands in for the HttpOnly cookie)

const readSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}
const writeSession = (session) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
const clearSession = () => sessionStorage.removeItem(SESSION_KEY)

function sessionUser(db) {
  const session = readSession()
  if (!session) return null
  // Same 30-minute idle rule as the backend cookie (Ref 8.4).
  if (Date.now() - session.lastActivityAt > policies.sessionIdleMinutes * MINUTE) {
    clearSession()
    return null
  }
  const user = db.users.find((u) => u.id === session.userId && !u.isDeleted)
  if (!user || user.securityStamp !== session.securityStamp) {
    clearSession()
    return null
  }
  writeSession({ ...session, lastActivityAt: Date.now() })
  return user
}

function requireUser(db, role) {
  const user = sessionUser(db)
  if (!user) fail(401, 'Please log in to continue.', 'unauthorized')
  if (role && user.role !== role) fail(403, "You don't have access to this.", 'forbidden')
  return user
}

const profile = (u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username, email: u.email,
  phoneNumber: u.phoneNumber, role: u.role })

/** Same checks and messages as backend PasswordResetService. */
function usableResetToken(db, token) {
  const record = db.userTokens.find((t) => t.purpose === 'PasswordReset' && t.token === String(token ?? '').trim())
  if (!record || record.consumedAt) invalid('token', 'This password reset link is invalid or has already been used.', 'token_invalid')
  if (new Date(record.expiresAt) <= new Date()) invalid('token', 'This password reset link has expired. Please request a new one.', 'token_expired')
  return record
}

// ---------------------------------------------------------------- catalog and pricing

const serviceItem = (s) => ({ id: s.id, category: s.category, categoryLabel: categoryLabels[s.category], name: s.name,
  price: s.price, pricingUnit: 'per service', maxQuantity: 1, isActive: s.isActive, durationMinutes: s.durationMinutes })
const addOnItem = (a) => ({ id: a.id, category: 'Stone', categoryLabel: categoryLabels.Stone, name: a.name,
  price: a.price, pricingUnit: 'per nail', maxQuantity: rules.LIMITS.maxNailsPerAddOn, isActive: a.isActive })

function catalog(db, includeInactive) {
  const visible = (row) => !row.isDeleted && (includeInactive || row.isActive)
  return {
    services: db.services.filter(visible).sort((a, b) => a.id - b.id).map(serviceItem),
    addOns: db.addOns.filter(visible).sort((a, b) => a.id - b.id).map(addOnItem),
    depositAmount: policies.depositAmount,
    depositRefundable: false,
    currency: 'PHP',
  }
}

/** Like the backend: bookings must say which hand each add-on goes on; price quotes may leave it out. */
function resolveSelection(db, serviceId, selections = [], { requireHand = false } = {}) {
  const service = db.services.find((s) => s.id === Number(serviceId) && !s.isDeleted && s.isActive)
  if (!service) invalid('serviceId', 'The selected service is not available.')
  if (new Set(selections.map((a) => a.addOnId)).size !== selections.length)
    invalid('addOns', 'Each add-on can only be selected once.')
  const addOns = selections.map(({ addOnId, nailCount, hand }) => {
    const addOn = db.addOns.find((a) => a.id === Number(addOnId) && !a.isDeleted && a.isActive)
    if (!addOn) invalid('addOns', `Add-on #${addOnId} is not available.`)
    if (!Number.isInteger(nailCount) || nailCount < 1 || nailCount > rules.LIMITS.maxNailsPerAddOn)
      invalid('addOns', `Number of nails must be between 1 and ${rules.LIMITS.maxNailsPerAddOn}.`)
    if (requireHand || hand != null) {
      const problem = rules.validateHand(hand, nailCount)
      if (problem) invalid('addOns', problem)
    }
    return { addOn, nailCount, hand: hand ?? 'Both' }
  })
  if (service.category === 'Removal' && addOns.length)
    invalid('addOns', "Stone add-ons can't be added to a removal service. Choose a Soft Gel service to add them.")
  return { service, addOns }
}

const HAND_LABELS = { Left: 'Left hand', Right: 'Right hand', Both: 'Both hands' }
const PAYMENT_OPTION_LABELS = { Deposit: 'Booking deposit', Full: 'Full payment' }

const quoteFor = (selection) => calculateQuote(selection.service, selection.addOns, policies.depositAmount)

// ---------------------------------------------------------------- schedule

// Same rules as backend ScheduleService: appointments start every 30 minutes from the 11:00 AM opening,
// must finish by the closing time, and keep the 30 minutes after their scheduled end free
// (11:00 + 60 minutes = 12:00, so the next appointment can start at 12:30).

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const fromMinutes = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`
/** "21:00:00" → "9:00 PM", the same text as the backend messages. */
const clockText = (time) => {
  const minutes = toMinutes(time)
  const hour = Math.floor(minutes / 60)
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}
const durationText = (minutes) => {
  const [h, m] = [Math.floor(minutes / 60), minutes % 60]
  return h === 0 ? `${m} minutes` : m === 0 ? (h === 1 ? '1 hour' : `${h} hours`) : `${h} h ${m} min`
}

/** [start, end) in minutes since midnight. */
const period = (start, minutes) => [toMinutes(start), toMinutes(start) + minutes]
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1]
/** The service plus the mandatory break after it. */
const occupiedBy = (start, minutes) => period(start, minutes + schedule.bufferMinutes)
const blockPeriod = (b) => b.startTime === null ? [0, 24 * 60]
  : [toMinutes(b.startTime), toMinutes(b.endTime ?? addMinutesToTime(b.startTime, schedule.slotIntervalMinutes))]

const blockedSlotResponse = (s) => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime ?? null,
  isWholeDay: s.startTime === null, reason: s.reason, createdAt: s.createdAt })
const describeBlock = (s) => s.startTime === null ? `${s.date} (whole day)` : `${s.date} ${s.startTime.slice(0, 5)}-${(s.endTime ?? '').slice(0, 5)}`

const closingTime = (db) => db.salonSettings.closingTime
const salonHours = (db) => ({ openingTime: schedule.openingTime, closingTime: closingTime(db),
  slotIntervalMinutes: schedule.slotIntervalMinutes, bufferMinutes: schedule.bufferMinutes })

/** Every start time from opening up to (not including) the closing time. */
function slotStarts(db) {
  const starts = []
  for (let m = toMinutes(schedule.openingTime); m < toMinutes(closingTime(db)); m += schedule.slotIntervalMinutes) starts.push(fromMinutes(m))
  return starts
}

const onGrid = (time) => {
  const offset = toMinutes(time) - toMinutes(schedule.openingTime)
  return offset >= 0 && offset % schedule.slotIntervalMinutes === 0
}

const isActive = (b) => !b.isDeleted && (b.status === 'Pending' || b.status === 'Confirmed')
const activeOn = (db, date) => db.bookings.filter((b) => isActive(b) && b.bookingDate === date)
const blocksFor = (db, date) => db.blockedSlots.filter((s) => !s.isDeleted && s.date === date)
const dayOfWeek = (date) => startsAt(date, '00:00:00').getDay()

function serviceDuration(db, serviceId) {
  if (serviceId == null || serviceId === '') return schedule.slotIntervalMinutes
  const service = db.services.find((s) => s.id === Number(serviceId) && !s.isDeleted && s.isActive)
  if (!service) invalid('serviceId', 'The selected service is not available.')
  return service.durationMinutes
}

function daySlots(db, date, serviceId) {
  const duration = serviceDuration(db, serviceId)
  const starts = slotStarts(db)
  const blocks = blocksFor(db, date)
  const closing = toMinutes(closingTime(db))
  const slot = (start, status) => ({ startTime: start, endTime: addMinutesToTime(start, duration), status })
  const day = (isClosed, slots) => ({ date, isClosed, closedReason: isClosed ? 'Closed' : null, slots,
    openingTime: schedule.openingTime, closingTime: closingTime(db), durationMinutes: duration, bufferMinutes: schedule.bufferMinutes })
  if (schedule.closedDaysOfWeek.includes(dayOfWeek(date)) || blocks.some((b) => b.startTime === null))
    return day(true, starts.map((s) => slot(s, 'Closed')))

  const blocked = blocks.map(blockPeriod)
  const occupied = activeOn(db, date).map((b) => occupiedBy(b.startTime, b.durationMinutes))
  const beyondWindow = date > addDays(today(), schedule.maxDaysAhead)
  return day(false, starts.map((start) => {
    const minute = toMinutes(start)
    const inside = ([from, to]) => from <= minute && minute < to
    const service = period(start, duration)
    return slot(start,
      startsAt(date, start) <= new Date() ? 'Past'
        : beyondWindow || blocked.some(inside) ? 'Closed'
          : occupied.some(inside) ? 'Booked'
            : service[1] > closing || blocked.some((b) => overlaps(b, service))
              || occupied.some((o) => overlaps(o, occupiedBy(start, duration))) ? 'TooShort'
              : 'Open')
  }))
}

function ensureBookable(db, date, startTime, duration, movingBookingId = null) {
  if (!date) invalid('bookingDate', 'Select a booking date.')
  if (!startTime) invalid('startTime', 'Please choose one of the available appointment times.')
  if (toMinutes(startTime) < toMinutes(schedule.openingTime))
    invalid('startTime', `Appointments can't start before the ${clockText(schedule.openingTime)} opening time.`)
  if (!onGrid(startTime)) invalid('startTime', 'Please choose one of the available appointment times.')
  if (startsAt(date, startTime) <= new Date()) invalid('bookingDate', 'Please choose a future date and time.')
  if (date > addDays(today(), schedule.maxDaysAhead))
    invalid('bookingDate', `Bookings can be made up to ${schedule.maxDaysAhead} days in advance.`)
  if (schedule.closedDaysOfWeek.includes(dayOfWeek(date))) conflict('The salon is closed on this day.', 'slot_unavailable')

  const service = period(startTime, duration)
  if (service[1] > toMinutes(closingTime(db)))
    conflict(`This service takes ${durationText(duration)}, so it would end after closing time (${clockText(closingTime(db))}). Please choose an earlier time.`, 'slot_unavailable')
  const blocks = blocksFor(db, date)
  if (blocks.some((b) => b.startTime === null)) conflict('The salon is closed on this day.', 'slot_unavailable')
  if (blocks.some((b) => overlaps(blockPeriod(b), service)))
    conflict('This time is not available. Please choose another one.', 'slot_unavailable')
  // The mock runs one request at a time, so this check is as good as the backend's day lock.
  if (activeOn(db, date).some((b) => b.id !== movingBookingId && overlaps(occupiedBy(b.startTime, b.durationMinutes), occupiedBy(startTime, duration))))
    conflict('This time overlaps another appointment or the 30-minute break after it. Please choose another time.', 'slot_unavailable')
}

// ---------------------------------------------------------------- bookings

function bookingResponse(db, b, includeClient) {
  const service = db.services.find((s) => s.id === b.serviceId)
  const addOnLines = db.bookingAddOns.filter((a) => a.bookingId === b.id).map((line) => ({
    addOnId: line.addOnId, name: db.addOns.find((a) => a.id === line.addOnId)?.name ?? 'Add-on',
    nailCount: line.nailCount, linePrice: line.linePrice, hand: line.hand ?? 'Both', handLabel: HAND_LABELS[line.hand ?? 'Both'],
  }))
  const totalPrice = b.servicePrice + addOnLines.reduce((sum, line) => sum + line.linePrice, 0)
  const cancellation = db.cancellations.find((c) => c.bookingId === b.id)
  const client = db.users.find((u) => u.id === b.clientId)
  return {
    id: b.id, status: b.status, bookingDate: b.bookingDate, startTime: b.startTime,
    endTime: addMinutesToTime(b.startTime, b.durationMinutes), durationMinutes: b.durationMinutes,
    serviceId: b.serviceId, serviceName: service?.name ?? 'Service', serviceCategory: service?.category ?? '',
    servicePrice: b.servicePrice, addOns: addOnLines, totalPrice, depositAmount: b.depositAmount,
    balanceDue: Math.max(0, totalPrice - (b.amountPaid ?? b.depositAmount)),
    payment: paymentInfo(db, b),
    note: b.note ?? null, createdAt: b.createdAt,
    cancellation: cancellation ? {
      reason: cancellation.reason, reasonLabel: reasonLabel(cancellation.reason), explanation: cancellation.explanation,
      cancelledByRole: db.users.find((u) => u.id === cancellation.cancelledByUserId)?.role ?? '', cancelledAt: cancellation.cancelledAt,
    } : null,
    client: includeClient && client ? { id: client.id, firstName: client.firstName, lastName: client.lastName,
      username: client.username, email: client.email, phoneNumber: client.phoneNumber } : null,
    referenceImages: db.referenceImages.filter((r) => r.bookingId === b.id && !r.isDeleted).map(referenceImageResponse),
  }
}

// Same shape as the backend BookingPaymentResponse.
function paymentInfo(db, b) {
  const p = db.payments.filter((x) => x.bookingId === b.id && x.status === 'Succeeded').sort((x, y) => x.paidAt.localeCompare(y.paidAt))[0]
  const option = b.paymentOption ?? 'Deposit'
  const admin = b.confirmedByUserId ? db.users.find((u) => u.id === b.confirmedByUserId) : null
  return { option, optionLabel: PAYMENT_OPTION_LABELS[option], amountPaid: b.amountPaid ?? b.depositAmount,
    referenceNumber: p?.referenceNumber ?? null, method: p?.method ?? null, paidAt: p?.paidAt ?? null, verified: Boolean(p?.verifiedAt),
    confirmedAt: b.confirmedAt ?? null, confirmedBy: admin ? `${admin.firstName} ${admin.lastName}` : null }
}

const draftResponse = (d) => ({ data: structuredClone(d.data), updatedAt: d.updatedAt, status: 'Draft' })

const newestFirst = (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id

function feedbackResponse(db, f, includeClient) {
  const client = includeClient ? db.users.find((u) => u.id === f.clientId) : null
  return { id: f.id, rating: f.rating, comment: f.comment, createdAt: f.createdAt,
    client: client ? { id: client.id, firstName: client.firstName, lastName: client.lastName, username: client.username,
      email: client.email, phoneNumber: client.phoneNumber } : null }
}

// ---------------------------------------------------------------- reference photos

const referenceImageResponse = (r) => ({ id: r.id, contentType: r.contentType, sizeBytes: r.sizeBytes, createdAt: r.createdAt, dataUrl: r.dataUrl })

/** Same check as the backend's ImageSignature: the file's first bytes, not its name or claimed type. */
function detectImageType(bytes) {
  const starts = (...values) => values.every((v, i) => bytes[i] === v)
  if (starts(0xFF, 0xD8, 0xFF)) return 'image/jpeg'
  if (starts(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return 'image/png'
  const text = (from, to) => String.fromCharCode(...bytes.slice(from, to))
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  return null
}

async function uploadReferenceImage(db, user, file) {
  if (!file || !file.size) invalid('file', rules.REFERENCE_IMAGE_MESSAGES.empty, 'image_missing')
  if (file.size > rules.LIMITS.referenceImageMaxBytes) invalid('file', rules.REFERENCE_IMAGE_MESSAGES.size, 'image_too_large')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = detectImageType(bytes)
  if (!contentType) invalid('file', rules.REFERENCE_IMAGE_MESSAGES.type, 'image_type')
  if (db.referenceImages.filter((r) => r.clientId === user.id && !r.bookingId && !r.isDeleted).length >= 10)
    conflict('You already have 10 photos waiting to be added to a booking. Remove one before uploading another.', 'too_many_pending_images')

  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const image = { id: nextId('referenceImages'), clientId: user.id, bookingId: null, contentType, sizeBytes: bytes.length,
    dataUrl: `data:${contentType};base64,${btoa(binary)}`, createdAt: nowIso(), isDeleted: false }
  db.referenceImages.push(image)
  audit(db, user.id, 'ReferenceImageUploaded', 'ReferenceImage', image.id, `${contentType}, ${image.sizeBytes} bytes`)
  saveDb()
  return { status: 201, data: referenceImageResponse(image) }
}

function attachReferenceImages(db, user, ids = []) {
  if (!ids?.length) return []
  if (ids.length > rules.LIMITS.referenceImagesPerBooking) invalid('referenceImageIds', rules.REFERENCE_IMAGE_MESSAGES.tooMany)
  const images = [...new Set(ids)].map((id) => db.referenceImages.find((r) => r.id === Number(id) && !r.isDeleted))
  if (images.some((r) => !r || r.clientId !== user.id || r.bookingId))
    invalid('referenceImageIds', 'One of the reference photos is no longer available. Please upload it again.', 'image_unavailable')
  return images
}

function receipt(db, payment) {
  const b = db.bookings.find((x) => x.id === payment.bookingId)
  const view = bookingResponse(db, b, false)
  return { paymentId: payment.id, bookingId: b.id, referenceNumber: payment.referenceNumber, method: payment.method,
    amount: payment.amount, currency: 'PHP', paidAt: payment.paidAt, status: payment.status, refundable: false,
    serviceName: db.services.find((s) => s.id === b.serviceId)?.name ?? '', bookingDate: b.bookingDate, startTime: b.startTime,
    paymentOption: payment.option ?? 'Deposit', paymentOptionLabel: PAYMENT_OPTION_LABELS[payment.option ?? 'Deposit'],
    totalAmount: view.totalPrice, balanceDue: view.balanceDue, bookingStatus: b.status }
}

const findBooking = (db, id) => db.bookings.find((b) => b.id === Number(id) && !b.isDeleted) ?? notFound('Booking not found.')

function ownedBooking(db, user, id) {
  const booking = db.bookings.find((b) => b.id === Number(id) && !b.isDeleted)
  // Another client's booking looks exactly like a missing one.
  if (!booking || booking.clientId !== user.id) notFound('Booking not found.')
  return booking
}

const describe = (date, time) => `${date} ${time.slice(0, 5)}`

function createBooking(db, user, body) {
  if (!body.depositAcknowledged)
    invalid('depositAcknowledged', 'You must acknowledge that the booking deposit is non-refundable.', 'deposit_not_acknowledged')
  if (!body.idempotencyKey) invalid('idempotencyKey', 'A payment request key is required.')
  if (!lookups.paymentMethods.some((m) => m.value === body.paymentMethod)) invalid('paymentMethod', 'Select GCash or Maya.')
  if (body.paymentOption != null && !Object.hasOwn(PAYMENT_OPTION_LABELS, body.paymentOption)) invalid('paymentOption', 'Choose to pay the deposit or the full amount.')
  if (String(body.note ?? '').length > rules.LIMITS.noteMax) invalid('note', `Your note must be ${rules.LIMITS.noteMax} characters or fewer.`)

  // Repeated Pay click: return the original booking instead of charging again (Ref 12.4).
  const earlier = db.payments.find((p) => p.idempotencyKey === body.idempotencyKey)
  if (earlier) {
    const b = db.bookings.find((x) => x.id === earlier.bookingId)
    if (b.clientId !== user.id) conflict('This payment request key has already been used.', 'idempotency_key_reused')
    return { status: 200, data: { booking: bookingResponse(db, b, false), receipt: receipt(db, earlier) } }
  }

  const selection = resolveSelection(db, body.serviceId, body.addOns ?? [], { requireHand: true })
  const referenceImages = attachReferenceImages(db, user, body.referenceImageIds)
  ensureBookable(db, body.bookingDate, body.startTime, selection.service.durationMinutes)

  // Simulated GCash / Maya charge. Booking, payment and slot are saved together or not at all (Ref 6.1).
  if (db.flags.failNextPayment) {
    db.flags.failNextPayment = false
    audit(db, user.id, 'PaymentFailed', 'Booking', null, `${body.paymentMethod} deposit for ${describe(body.bookingDate, body.startTime)}`)
    saveDb()
    fail(402, 'The e-wallet declined the payment. You have not been charged.', 'payment_failed')
  }

  // Deposit or full payment; the amount is worked out here from the prices, never taken from the request.
  const option = body.paymentOption ?? 'Deposit'
  const quote = quoteFor(selection)
  const amount = option === 'Full' ? quote.fullAmount : quote.deposit
  const createdAt = nowIso()
  const booking = { id: nextId('bookings'), clientId: user.id, serviceId: selection.service.id, servicePrice: selection.service.price,
    depositAmount: quote.deposit, bookingDate: body.bookingDate, startTime: body.startTime, durationMinutes: selection.service.durationMinutes,
    note: String(body.note ?? '').trim() || null, paymentOption: option, amountPaid: amount,
    confirmedAt: null, confirmedByUserId: null,
    status: 'Pending', createdAt, updatedAt: createdAt, reminderSentAt: null, isDeleted: false }
  db.bookings.push(booking)
  for (const image of referenceImages) image.bookingId = booking.id
  for (const { addOn, nailCount, hand } of selection.addOns)
    db.bookingAddOns.push({ id: nextId('bookingAddOns'), bookingId: booking.id, addOnId: addOn.id, nailCount, hand, linePrice: addOn.price * nailCount })
  // The draft has become a real booking.
  db.bookingDrafts = db.bookingDrafts.filter((d) => d.clientId !== user.id)

  const prefix = body.paymentMethod === 'GCash' ? 'GC' : 'MY'
  const payment = { id: nextId('payments'), bookingId: booking.id, clientId: user.id, method: body.paymentMethod, option, amount,
    totalAmount: quote.total, balanceAfter: Math.max(0, quote.total - amount),
    referenceNumber: `${prefix}-${today().replaceAll('-', '')}-${randomHex(5).toUpperCase()}`,
    idempotencyKey: body.idempotencyKey, status: 'Succeeded', paidAt: nowIso(), verifiedAt: null, verifiedByUserId: null }
  db.payments.push(payment)
  // The booking stays Pending: Leyah confirms it after checking the payment.

  const what = option === 'Full' ? 'full payment' : 'deposit'
  audit(db, user.id, 'PaymentSucceeded', 'Payment', payment.referenceNumber, `${payment.method} PHP ${payment.amount.toFixed(2)} ${what} for booking #${booking.id}`)
  audit(db, user.id, 'BookingCreated', 'Booking', booking.id, `${selection.service.name} on ${describe(booking.bookingDate, booking.startTime)}, total PHP ${quote.total.toFixed(2)}`)
  sendEmail(db, user.email, 'We received your Nails by Leyah booking',
    `Hi ${user.firstName}, we received your ${selection.service.name} booking for ${booking.bookingDate} at ${booking.startTime.slice(0, 5)}. ` +
    `${PAYMENT_OPTION_LABELS[option]} paid: PHP ${payment.amount.toFixed(2)} (reference ${payment.referenceNumber}). ` +
    `Leyah will check it and confirm your appointment. The booking deposit is non-refundable.`)
  saveDb()
  return { status: 201, data: { booking: bookingResponse(db, booking, false), receipt: receipt(db, payment) } }
}

function moveBooking(db, user, booking, body) {
  if (!isActive(booking)) conflict(`A ${booking.status} booking cannot be rescheduled.`, 'invalid_status')
  if (booking.bookingDate === body.bookingDate && booking.startTime === body.startTime)
    invalid('startTime', 'Choose a different date or time.')
  ensureBookable(db, body.bookingDate, body.startTime, booking.durationMinutes, booking.id)

  const from = describe(booking.bookingDate, booking.startTime)
  Object.assign(booking, { bookingDate: body.bookingDate, startTime: body.startTime, reminderSentAt: null, updatedAt: nowIso() })
  audit(db, user.id, 'BookingRescheduled', 'Booking', booking.id, `${from} -> ${describe(body.bookingDate, body.startTime)}`)
  saveDb()
}

function cancelBooking(db, user, booking, reason, explanation) {
  if (!isActive(booking)) conflict(`A ${booking.status} booking cannot be cancelled.`, 'invalid_status')
  booking.status = 'Cancelled'
  booking.updatedAt = nowIso()
  db.cancellations.push({ id: nextId('cancellations'), bookingId: booking.id, cancelledByUserId: user.id, reason,
    explanation: explanation?.trim() ? explanation.trim() : null, cancelledAt: nowIso() })
  audit(db, user.id, 'BookingCancelled', 'Booking', booking.id, `Reason: ${reasonLabel(reason)}. The deposit is non-refundable.`)
  saveDb()
}

// ---------------------------------------------------------------- reports

function utcRangeForDay(date) {
  const start = startsAt(date, '00:00:00')
  return [start.toISOString(), new Date(start.getTime() + 24 * 60 * MINUTE).toISOString()]
}

function dailyReport(db, date) {
  const [from, to] = utcRangeForDay(date)
  const live = db.bookings.filter((b) => !b.isDeleted)
  const completed = live.filter((b) => b.bookingDate === date && b.status === 'Completed')
  return {
    date,
    bookingsMade: live.filter((b) => b.createdAt >= from && b.createdAt < to).length,
    bookingsCompleted: completed.length,
    bookingsCancelled: db.cancellations.filter((c) => c.cancelledAt >= from && c.cancelledAt < to).length,
    depositsCollected: db.payments.filter((p) => p.status === 'Succeeded' && p.paidAt >= from && p.paidAt < to).reduce((s, p) => s + p.amount, 0),
    completedServicesValue: completed.reduce((s, b) => s + bookingResponse(db, b, false).totalPrice, 0),
  }
}

// ---------------------------------------------------------------- catalog management helpers

function validateServiceBody(body, { durationRequired = false } = {}) {
  const errors = {}
  const name = rules.validateServiceName(body.name)
  const price = rules.validatePrice(body.price)
  const duration = durationRequired || body.durationMinutes != null ? rules.validateDuration(body.durationMinutes) : null
  if (name) errors.name = name
  if (price) errors.price = price
  if (duration) errors.durationMinutes = duration
  if (Object.keys(errors).length) invalidMany(errors)
}

function updateCatalogRow(db, user, row, body, entityType) {
  validateServiceBody(body)
  const table = entityType === 'AddOn' ? db.addOns : db.services
  const name = body.name.trim()
  if (table.some((r) => r.id !== row.id && same(r.name, name) && (entityType === 'AddOn' || r.category === row.category)))
    conflict(`An item named '${name}' already exists.`, 'duplicate_name')
  let details = `'${row.name}' -> '${name}', PHP ${row.price.toFixed(2)} -> ${Number(body.price).toFixed(2)}, active ${row.isActive} -> ${body.isActive}`
  // Existing bookings keep the duration stored on them; only new bookings use the new one.
  if (entityType === 'Service' && body.durationMinutes != null) {
    details += `, ${row.durationMinutes} -> ${body.durationMinutes} min`
    row.durationMinutes = Number(body.durationMinutes)
  }
  Object.assign(row, { name, price: Number(body.price), isActive: Boolean(body.isActive), updatedAt: nowIso() })
  audit(db, user.id, 'ServiceUpdated', entityType, row.id, details)
  saveDb()
}

// ---------------------------------------------------------------- routes

const routes = [
  // Authentication
  ['POST', '/auth/register', (db, { body }) => {
    const errors = rules.validateRegistration(body)
    if (Object.keys(errors).length) invalidMany(errors)
    const taken = {}
    if (db.users.some((u) => same(u.username, body.username))) taken.username = 'Username is already taken.'
    if (db.users.some((u) => same(u.email, body.email))) taken.email = 'An account with this email address already exists.'
    if (db.users.some((u) => u.phoneNumber === body.phoneNumber.trim())) taken.phoneNumber = 'This phone number is already registered.'
    if (Object.keys(taken).length) invalidMany(taken)

    const createdAt = nowIso()
    const user = { id: nextId('users'), firstName: body.firstName.trim(), lastName: body.lastName.trim(), username: body.username.trim(),
      email: body.email.trim().toLowerCase(), phoneNumber: body.phoneNumber.trim(), password: body.password, role: 'Client',
      emailVerified: false, termsVersion: policies.termsVersion, termsAcceptedAt: createdAt, failedLoginCount: 0, lockoutEndUtc: null,
      securityStamp: randomHex(8), createdAt, updatedAt: createdAt, isDeleted: false }
    db.users.push(user)
    const code = sixDigitCode()
    db.userTokens.push({ id: nextId('userTokens'), userId: user.id, purpose: 'EmailVerification', token: code,
      expiresAt: new Date(Date.now() + policies.emailVerificationCodeHours * 60 * MINUTE).toISOString(), consumedAt: null, failedAttempts: 0, createdAt })
    audit(db, user.id, 'UserRegistered', 'User', user.id, `Terms v${policies.termsVersion} accepted`)
    sendEmail(db, user.email, 'Verify your Nails by Leyah account', `Hi ${user.firstName}, your verification code is ${code}. It expires in 24 hours.`, { code })
    saveDb()
    return { status: 201, data: { userId: user.id, message: 'Registration successful. Check your email for the verification code to activate your account.' } }
  }],

  ['GET', '/auth/username-availability', (db, { query }) => {
    const username = String(query.username ?? '').trim()
    const lengthError = rules.validateUsername(username)
    if (lengthError) return { username, available: false, message: lengthError }
    const taken = db.users.some((u) => same(u.username, username))
    return { username, available: !taken, message: taken ? 'Username is already taken.' : 'Username is available.' }
  }],

  ['POST', '/auth/verify-email', (db, { body }) => {
    const codeError = rules.validateVerificationCode(body.code)
    if (codeError) invalid('code', codeError)
    const user = db.users.find((u) => same(u.email, body.email) && !u.isDeleted) ?? invalid('code', 'The verification code is invalid.', 'token_invalid')
    if (user.emailVerified) return { message: 'Your email address is verified. You can now log in.' }
    const token = db.userTokens.filter((t) => t.userId === user.id && t.purpose === 'EmailVerification' && !t.consumedAt).at(-1)
    if (!token) invalid('code', 'The verification code is invalid.', 'token_invalid')
    if (new Date(token.expiresAt) <= new Date()) invalid('code', 'This verification code has expired. Please request a new one.', 'token_expired')
    if (token.failedAttempts >= policies.maxVerificationAttempts) invalid('code', 'Too many incorrect attempts. Please request a new code.', 'token_locked')
    if (token.token !== body.code.trim()) {
      token.failedAttempts++
      saveDb()
      invalid('code', 'The verification code is invalid.', 'token_invalid')
    }
    token.consumedAt = nowIso()
    user.emailVerified = true
    audit(db, user.id, 'EmailVerified', 'User', user.id)
    saveDb()
    return { message: 'Your email address is verified. You can now log in.' }
  }],

  ['POST', '/auth/resend-verification', (db, { body }) => {
    const user = db.users.find((u) => same(u.email, body.email) && !u.isDeleted)
    if (user && !user.emailVerified) {
      db.userTokens.filter((t) => t.userId === user.id && t.purpose === 'EmailVerification' && !t.consumedAt).forEach((t) => { t.consumedAt = nowIso() })
      const code = sixDigitCode()
      db.userTokens.push({ id: nextId('userTokens'), userId: user.id, purpose: 'EmailVerification', token: code,
        expiresAt: new Date(Date.now() + policies.emailVerificationCodeHours * 60 * MINUTE).toISOString(), consumedAt: null, failedAttempts: 0, createdAt: nowIso() })
      sendEmail(db, user.email, 'Verify your Nails by Leyah account', `Hi ${user.firstName}, your new verification code is ${code}.`, { code })
      saveDb()
    }
    return { message: 'If that account still needs verification, a new code has been sent.' }
  }],

  ['POST', '/auth/login', (db, { body }) => {
    const errors = rules.validateLogin(body)
    if (Object.keys(errors).length) invalidMany(errors)
    const user = db.users.find((u) => !u.isDeleted && (same(u.username, body.usernameOrEmail) || same(u.email, body.usernameOrEmail)))
    if (!user) fail(401, 'Invalid username or password.', 'invalid_credentials')

    const lockedMessage = 'Your account is locked because of too many failed login attempts. Please try again in 15 minutes.'
    if (user.lockoutEndUtc && new Date(user.lockoutEndUtc) > new Date()) fail(423, lockedMessage, 'account_locked')

    if (user.password !== body.password) {
      user.failedLoginCount++
      if (user.failedLoginCount >= policies.maxFailedLoginAttempts) {
        user.failedLoginCount = 0
        user.lockoutEndUtc = new Date(Date.now() + policies.lockoutMinutes * MINUTE).toISOString()
        audit(db, user.id, 'AccountLocked', 'User', user.id)
        saveDb()
        fail(423, lockedMessage, 'account_locked')
      }
      audit(db, user.id, 'LoginFailed', 'User', user.id)
      saveDb()
      fail(401, 'Invalid username or password.', 'invalid_credentials')
    }
    if (!user.emailVerified) fail(403, 'Please verify your email address before logging in.', 'email_not_verified')

    user.failedLoginCount = 0
    user.lockoutEndUtc = null
    audit(db, user.id, 'LoginSucceeded', 'User', user.id)
    saveDb()
    writeSession({ userId: user.id, securityStamp: user.securityStamp, lastActivityAt: Date.now() })
    return profile(user)
  }],

  ['POST', '/auth/logout', () => {
    clearSession()
    return { status: 204, data: null }
  }],

  ['GET', '/auth/me', (db) => profile(requireUser(db))],

  ['POST', '/auth/forgot-password', (db, { body }) => {
    const emailError = rules.validateEmail(body.email)
    if (emailError) invalid('email', emailError)
    const user = db.users.find((u) => same(u.email, body.email) && !u.isDeleted)
    if (user) {
      const token = randomHex(24)
      db.userTokens.push({ id: nextId('userTokens'), userId: user.id, purpose: 'PasswordReset', token,
        expiresAt: new Date(Date.now() + policies.passwordResetTokenMinutes * MINUTE).toISOString(), consumedAt: null, failedAttempts: 0, createdAt: nowIso() })
      audit(db, user.id, 'PasswordResetRequested', 'User', user.id)
      const link = `${window.location.origin}/reset-password?token=${token}`
      sendEmail(db, user.email, 'Reset your Nails by Leyah password', `Use this link within 15 minutes to choose a new password: ${link}`, { link })
      saveDb()
    }
    return { message: 'If that email address is registered, a password reset link has been sent. It expires in 15 minutes.' }
  }],

  ['GET', '/auth/reset-password/validate', (db, { query }) => {
    usableResetToken(db, query.token)
    return { message: 'This password reset link is valid.' }
  }],

  ['POST', '/auth/reset-password', (db, { body }) => {
    const errors = rules.validateResetPassword(body)
    if (Object.keys(errors).length) invalidMany(errors)
    const record = usableResetToken(db, body.token)
    const user = db.users.find((u) => u.id === record.userId)
    Object.assign(user, { password: body.newPassword, securityStamp: randomHex(8), failedLoginCount: 0, lockoutEndUtc: null, updatedAt: nowIso() })
    db.userTokens.filter((t) => t.userId === user.id && t.purpose === 'PasswordReset' && !t.consumedAt).forEach((t) => { t.consumedAt = nowIso() })
    audit(db, user.id, 'PasswordReset', 'User', user.id)
    saveDb()
    return { message: 'Your password has been changed. You can now log in with your new password.' }
  }],

  // Public catalog
  ['GET', '/services', (db) => catalog(db, false)],
  ['POST', '/pricing/quote', (db, { body }) => ({ ...quoteFor(resolveSelection(db, body.serviceId, body.addOns ?? [])), currency: 'PHP' })],
  ['GET', '/slots', (db, { query }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date ?? '')) invalid('date', 'Select a date.')
    return daySlots(db, query.date, query.serviceId)
  }],
  ['GET', '/salon-hours', (db) => salonHours(db)],
  ['GET', '/lookups', () => structuredClone(lookups)],

  // Client bookings
  ['POST', '/bookings', (db, { body }) => createBooking(db, requireUser(db, 'Client'), body)],
  ['GET', '/bookings', (db) => {
    const user = requireUser(db, 'Client')
    return db.bookings.filter((b) => b.clientId === user.id && !b.isDeleted)
      .sort((a, b) => (b.bookingDate + b.startTime).localeCompare(a.bookingDate + a.startTime))
      .map((b) => bookingResponse(db, b, false))
  }],
  ['GET', '/bookings/:id', (db, { params }) => bookingResponse(db, ownedBooking(db, requireUser(db, 'Client'), params.id), false)],

  // Booking draft: one per client, never an appointment
  ['GET', '/booking-draft', (db) => {
    const user = requireUser(db, 'Client')
    const draft = db.bookingDrafts.find((d) => d.clientId === user.id)
    // Wrapped explicitly: a draft has its own "data" and "status" fields.
    return draft ? { status: 200, data: draftResponse(draft) } : { status: 204, data: null }
  }],
  ['PUT', '/booking-draft', (db, { body }) => {
    const user = requireUser(db, 'Client')
    const data = body?.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) invalid('data', 'The booking draft must be a JSON object.')
    if (JSON.stringify(data).length > rules.LIMITS.bookingDraftMax) invalid('data', 'The booking draft is too large.')
    let draft = db.bookingDrafts.find((d) => d.clientId === user.id)
    if (!draft) db.bookingDrafts.push(draft = { id: nextId('bookingDrafts'), clientId: user.id })
    Object.assign(draft, { data: structuredClone(data), updatedAt: nowIso() })
    saveDb()
    return { status: 200, data: draftResponse(draft) }
  }],
  ['DELETE', '/booking-draft', (db) => {
    const user = requireUser(db, 'Client')
    db.bookingDrafts = db.bookingDrafts.filter((d) => d.clientId !== user.id)
    saveDb()
    return { status: 204, data: null }
  }],

  // Customer feedback
  ['POST', '/feedback', (db, { body }) => {
    const user = requireUser(db, 'Client')
    const errors = rules.validateFeedback(body)
    if (Object.keys(errors).length) invalidMany(errors)
    if (!body.submissionKey) invalid('submissionKey', 'A submission key is required.')
    const earlier = db.feedback.find((f) => f.submissionKey === body.submissionKey)
    if (earlier) {
      if (earlier.clientId !== user.id) conflict('This submission key has already been used.', 'submission_key_reused')
      return { status: 200, data: feedbackResponse(db, earlier, false) }
    }
    const comment = String(body.comment ?? '').trim()
    const row = { id: nextId('feedback'), clientId: user.id, rating: Number(body.rating), comment: comment || null,
      submissionKey: body.submissionKey, createdAt: nowIso() }
    db.feedback.push(row)
    audit(db, user.id, 'FeedbackSubmitted', 'Feedback', row.id, `${row.rating} star(s)`)
    saveDb()
    return { status: 201, data: feedbackResponse(db, row, false) }
  }],
  ['GET', '/feedback', (db) => {
    const user = requireUser(db, 'Client')
    return db.feedback.filter((f) => f.clientId === user.id).sort(newestFirst).map((f) => feedbackResponse(db, f, false))
  }],
  ['GET', '/admin/feedback', (db, { query }) => {
    requireUser(db, 'Administrator')
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    const all = [...db.feedback].sort(newestFirst)
    const countsByRating = Object.fromEntries([1, 2, 3, 4, 5].map((r) => [r, all.filter((f) => f.rating === r).length]))
    const averageRating = all.length ? Math.round((all.reduce((sum, f) => sum + f.rating, 0) / all.length) * 10) / 10 : 0
    return { items: all.slice((page - 1) * pageSize, page * pageSize).map((f) => feedbackResponse(db, f, true)),
      page, pageSize, totalCount: all.length, averageRating, countsByRating }
  }],

  // Nail design reference photos
  ['POST', '/reference-images', (db, { file }) => uploadReferenceImage(db, requireUser(db, 'Client'), file)],
  ['GET', '/reference-images/pending', (db) => {
    const user = requireUser(db, 'Client')
    return db.referenceImages.filter((r) => r.clientId === user.id && !r.bookingId && !r.isDeleted).map(referenceImageResponse)
  }],
  ['DELETE', '/reference-images/:id', (db, { params }) => {
    const user = requireUser(db, 'Client')
    const image = db.referenceImages.find((r) => r.id === Number(params.id) && !r.isDeleted)
    if (!image || image.clientId !== user.id) notFound('Reference photo not found.')
    if (image.bookingId) conflict('This photo is part of a booking and can no longer be removed.', 'image_attached')
    image.isDeleted = true
    audit(db, user.id, 'ReferenceImageRemoved', 'ReferenceImage', image.id)
    saveDb()
    return null
  }],

  ['GET', '/bookings/:id/receipt', (db, { params }) => {
    const booking = ownedBooking(db, requireUser(db, 'Client'), params.id)
    const payment = db.payments.find((p) => p.bookingId === booking.id && p.status === 'Succeeded') ?? notFound('No payment has been recorded for this booking.')
    return receipt(db, payment)
  }],
  ['POST', '/bookings/:id/reschedule', (db, { params, body }) => {
    const user = requireUser(db, 'Client')
    const booking = ownedBooking(db, user, params.id)
    if ((startsAt(booking.bookingDate, booking.startTime) - new Date()) / (60 * MINUTE) < policies.rescheduleMinimumHours)
      conflict(`Appointments can only be rescheduled at least ${policies.rescheduleMinimumHours} hours before the scheduled time.`, 'reschedule_window_passed')
    moveBooking(db, user, booking, body)
    return bookingResponse(db, booking, false)
  }],
  ['POST', '/bookings/:id/cancel', (db, { params, body }) => {
    const user = requireUser(db, 'Client')
    const booking = ownedBooking(db, user, params.id)
    if (!lookups.clientCancellationReasons.some((r) => r.value === body.reason)) invalid('reason', 'Select a cancellation reason.')
    if (startsAt(booking.bookingDate, booking.startTime) <= new Date())
      conflict('This appointment has already started or passed and can no longer be cancelled.', 'invalid_status')
    cancelBooking(db, user, booking, body.reason, null)
    return bookingResponse(db, booking, false)
  }],

  // Administrator
  ['GET', '/admin/dashboard', (db) => {
    requireUser(db, 'Administrator')
    const day = today()
    const [from, to] = utcRangeForDay(day)
    const todays = db.bookings.filter((b) => !b.isDeleted && b.bookingDate === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
    const paid = db.payments.filter((p) => p.status === 'Succeeded')
    return {
      today: day,
      todaysBookingCount: todays.filter((b) => b.status !== 'Cancelled').length,
      todaysBookings: todays.map((b) => bookingResponse(db, b, true)),
      pendingBookingCount: db.bookings.filter((b) => !b.isDeleted && b.status === 'Pending').length,
      depositsCollectedToday: paid.filter((p) => p.paidAt >= from && p.paidAt < to).reduce((s, p) => s + p.amount, 0),
      totalDepositsCollected: paid.reduce((s, p) => s + p.amount, 0),
    }
  }],
  ['GET', '/admin/bookings', (db, { query }) => {
    requireUser(db, 'Administrator')
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
    const name = String(query.clientName ?? '').trim().toLowerCase()
    const matches = db.bookings.filter((b) => {
      if (b.isDeleted || (query.date && b.bookingDate !== query.date) || (query.status && b.status !== query.status)) return false
      if (!name) return true
      const c = db.users.find((u) => u.id === b.clientId)
      return [c.firstName, c.lastName, `${c.firstName} ${c.lastName}`, c.username].some((v) => v.toLowerCase().includes(name))
    }).sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || a.startTime.localeCompare(b.startTime))
    return { items: matches.slice((page - 1) * pageSize, page * pageSize).map((b) => bookingResponse(db, b, true)), page, pageSize, totalCount: matches.length }
  }],
  ['GET', '/admin/bookings/:id', (db, { params }) => {
    requireUser(db, 'Administrator')
    return bookingResponse(db, findBooking(db, params.id), true)
  }],
  ['POST', '/admin/bookings/:id/confirm', (db, { params }) => {
    const admin = requireUser(db, 'Administrator')
    const booking = findBooking(db, params.id)
    const payment = db.payments.find((p) => p.bookingId === booking.id && p.status === 'Succeeded')
    if (!payment) conflict('No payment has been received for this booking yet.', 'deposit_not_received')
    if (booking.status !== 'Pending') conflict(`A ${booking.status} booking cannot be confirmed.`, 'invalid_status')
    // Confirming is the administrator's check of the payment: both are recorded with who did it.
    const now = nowIso()
    Object.assign(booking, { status: 'Confirmed', confirmedAt: now, confirmedByUserId: admin.id, updatedAt: now })
    Object.assign(payment, { verifiedAt: now, verifiedByUserId: admin.id })
    audit(db, admin.id, 'BookingConfirmed', 'Booking', booking.id, `${PAYMENT_OPTION_LABELS[booking.paymentOption ?? 'Deposit']} PHP ${payment.amount.toFixed(2)} verified (reference ${payment.referenceNumber})`)
    const client = db.users.find((u) => u.id === booking.clientId)
    if (client) sendEmail(db, client.email, 'Your Nails by Leyah booking is confirmed',
      `Hi ${client.firstName}, Leyah has confirmed your appointment on ${booking.bookingDate} at ${booking.startTime.slice(0, 5)}. See you soon!`)
    saveDb()
    return bookingResponse(db, booking, true)
  }],
  ['POST', '/admin/bookings/:id/complete', (db, { params }) => {
    const admin = requireUser(db, 'Administrator')
    const booking = findBooking(db, params.id)
    if (booking.bookingDate > today()) conflict('A booking can only be completed on or after its appointment date.', 'invalid_status')
    if (booking.status !== 'Confirmed') conflict('Only confirmed bookings can be completed.', 'invalid_status')
    booking.status = 'Completed'
    audit(db, admin.id, 'BookingCompleted', 'Booking', booking.id)
    saveDb()
    return bookingResponse(db, booking, true)
  }],
  ['POST', '/admin/bookings/:id/reschedule', (db, { params, body }) => {
    const admin = requireUser(db, 'Administrator')
    const booking = findBooking(db, params.id)
    moveBooking(db, admin, booking, body)
    return bookingResponse(db, booking, true)
  }],
  ['POST', '/admin/bookings/:id/cancel', (db, { params, body }) => {
    const admin = requireUser(db, 'Administrator')
    const booking = findBooking(db, params.id)
    if (!lookups.adminCancellationReasons.some((r) => r.value === body.reason)) invalid('reason', 'Select a cancellation reason.')
    if ((body.explanation ?? '').length > rules.LIMITS.explanationMax)
      invalid('explanation', `Explanation must be ${rules.LIMITS.explanationMax} characters or fewer.`)
    cancelBooking(db, admin, booking, body.reason, body.explanation)
    return bookingResponse(db, booking, true)
  }],

  ['GET', '/admin/services', (db) => {
    requireUser(db, 'Administrator')
    return catalog(db, true)
  }],
  ['POST', '/admin/services', (db, { body }) => {
    const admin = requireUser(db, 'Administrator')
    if (!['SoftGel', 'Removal'].includes(body.category)) invalid('category', 'Category must be one of: SoftGel, Removal.')
    body = { durationMinutes: 60, ...body }
    validateServiceBody(body, { durationRequired: true })
    const name = body.name.trim()
    if (db.services.some((s) => s.category === body.category && same(s.name, name)))
      conflict(`A ${categoryLabels[body.category]} service named '${name}' already exists.`, 'duplicate_name')
    const row = { id: nextId('services'), category: body.category, name, price: Number(body.price), durationMinutes: Number(body.durationMinutes), isActive: true, isDeleted: false, createdAt: nowIso(), updatedAt: nowIso() }
    db.services.push(row)
    audit(db, admin.id, 'ServiceCreated', 'Service', row.id, `${categoryLabels[row.category]} '${row.name}' at PHP ${row.price.toFixed(2)}, ${row.durationMinutes} min`)
    saveDb()
    return { status: 201, data: serviceItem(row) }
  }],
  ['PUT', '/admin/services/:id', (db, { params, body }) => {
    const admin = requireUser(db, 'Administrator')
    const row = db.services.find((s) => s.id === Number(params.id) && !s.isDeleted) ?? notFound('Service not found.')
    updateCatalogRow(db, admin, row, body, 'Service')
    return serviceItem(row)
  }],
  ['DELETE', '/admin/services/:id', (db, { params }) => {
    const admin = requireUser(db, 'Administrator')
    const row = db.services.find((s) => s.id === Number(params.id) && !s.isDeleted) ?? notFound('Service not found.')
    Object.assign(row, { isDeleted: true, isActive: false, updatedAt: nowIso() })
    audit(db, admin.id, 'ServiceDeleted', 'Service', row.id, row.name)
    saveDb()
    return { status: 204, data: null }
  }],
  ['POST', '/admin/addons', (db, { body }) => {
    const admin = requireUser(db, 'Administrator')
    validateServiceBody(body)
    const name = body.name.trim()
    if (db.addOns.some((a) => same(a.name, name))) conflict(`An add-on named '${name}' already exists.`, 'duplicate_name')
    const row = { id: nextId('addOns'), name, price: Number(body.price), isActive: true, isDeleted: false, createdAt: nowIso(), updatedAt: nowIso() }
    db.addOns.push(row)
    audit(db, admin.id, 'ServiceCreated', 'AddOn', row.id, `Add-on '${row.name}' at PHP ${row.price.toFixed(2)} per nail`)
    saveDb()
    return { status: 201, data: addOnItem(row) }
  }],
  ['PUT', '/admin/addons/:id', (db, { params, body }) => {
    const admin = requireUser(db, 'Administrator')
    const row = db.addOns.find((a) => a.id === Number(params.id) && !a.isDeleted) ?? notFound('Add-on not found.')
    updateCatalogRow(db, admin, row, body, 'AddOn')
    return addOnItem(row)
  }],
  ['DELETE', '/admin/addons/:id', (db, { params }) => {
    const admin = requireUser(db, 'Administrator')
    const row = db.addOns.find((a) => a.id === Number(params.id) && !a.isDeleted) ?? notFound('Add-on not found.')
    Object.assign(row, { isDeleted: true, isActive: false, updatedAt: nowIso() })
    audit(db, admin.id, 'ServiceDeleted', 'AddOn', row.id, row.name)
    saveDb()
    return { status: 204, data: null }
  }],

  ['GET', '/admin/blocked-slots', (db, { query }) => {
    requireUser(db, 'Administrator')
    if (query.to < query.from) invalid('to', 'The end date must be on or after the start date.')
    return db.blockedSlots.filter((s) => !s.isDeleted && s.date >= query.from && s.date <= query.to)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime)))
      .map(blockedSlotResponse)
  }],
  ['POST', '/admin/blocked-slots', (db, { body }) => {
    const admin = requireUser(db, 'Administrator')
    if (!body.date) invalid('date', 'Select a date to block.')
    if (body.date < today()) invalid('date', 'Past dates cannot be blocked.')
    if (body.endTime && !body.startTime) invalid('startTime', 'Choose when the blocked period starts.')
    if (body.endTime && body.startTime && body.endTime <= body.startTime) invalid('endTime', 'The end time must be after the start time.')
    const startTime = body.startTime || null
    const endTime = startTime ? body.endTime || addMinutesToTime(startTime, schedule.slotIntervalMinutes) : null
    if (startTime && (!onGrid(startTime) || !onGrid(endTime) || endTime <= startTime))
      invalid('startTime', 'Please choose one of the appointment times.')
    if (endTime && endTime > closingTime(db)) invalid('endTime', `The blocked time must end by closing time (${clockText(closingTime(db))}).`)
    if ((body.reason ?? '').length > rules.LIMITS.blockReasonMax) invalid('reason', `Reason must be ${rules.LIMITS.blockReasonMax} characters or fewer.`)

    const row = { id: null, date: body.date, startTime, endTime, reason: body.reason?.trim() || null,
      createdByUserId: admin.id, createdAt: nowIso(), isDeleted: false }
    if (blocksFor(db, body.date).some((b) => b.startTime === null || (startTime && overlaps(blockPeriod(b), blockPeriod(row)))))
      conflict('This date or time is already blocked.', 'already_blocked')
    if (activeOn(db, body.date).some((b) => !startTime || overlaps(period(b.startTime, b.durationMinutes), blockPeriod(row))))
      conflict('There are active bookings in this period. Reschedule or cancel them before blocking it.', 'has_active_bookings')
    row.id = nextId('blockedSlots')
    db.blockedSlots.push(row)
    audit(db, admin.id, 'SlotBlocked', 'BlockedSlot', row.id, describeBlock(row))
    saveDb()
    return { status: 201, data: blockedSlotResponse(row) }
  }],
  ['DELETE', '/admin/blocked-slots/:id', (db, { params }) => {
    const admin = requireUser(db, 'Administrator')
    const row = db.blockedSlots.find((s) => s.id === Number(params.id) && !s.isDeleted) ?? notFound('Blocked slot not found.')
    row.isDeleted = true
    audit(db, admin.id, 'SlotUnblocked', 'BlockedSlot', row.id, describeBlock(row))
    saveDb()
    return { status: 204, data: null }
  }],

  ['GET', '/admin/salon-hours', (db) => {
    requireUser(db, 'Administrator')
    return salonHours(db)
  }],
  ['PUT', '/admin/salon-hours', (db, { body }) => {
    const admin = requireUser(db, 'Administrator')
    const closing = String(body.closingTime ?? '')
    const latest = 24 * 60 - schedule.slotIntervalMinutes
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(closing) || toMinutes(closing) < toMinutes(schedule.openingTime) + 60
      || toMinutes(closing) > latest || !onGrid(closing))
      invalid('closingTime', `Choose a closing time between ${clockText(addMinutesToTime(schedule.openingTime, 60))} and ${clockText(fromMinutes(latest))}, on the hour or half hour.`)
    const closingTimeValue = fromMinutes(toMinutes(closing))
    // Appointments already booked are never cut short: they have to be moved first.
    const late = db.bookings.filter((b) => isActive(b) && b.bookingDate >= today()
      && period(b.startTime, b.durationMinutes)[1] > toMinutes(closingTimeValue)).length
    if (late > 0)
      conflict(`${late} booked appointment(s) end after ${clockText(closingTimeValue)}. Reschedule or cancel them before closing earlier.`, 'has_active_bookings')
    const previous = db.salonSettings.closingTime
    Object.assign(db.salonSettings, { closingTime: closingTimeValue, updatedAt: nowIso(), updatedByUserId: admin.id })
    audit(db, admin.id, 'SalonHoursChanged', 'SalonSettings', 1, `Closing time ${clockText(previous)} -> ${clockText(closingTimeValue)}`)
    saveDb()
    return salonHours(db)
  }],

  ['GET', '/admin/reports/daily', (db, { query }) => {
    requireUser(db, 'Administrator')
    if (!query.date) invalid('date', 'Select a date.')
    return dailyReport(db, query.date)
  }],
  ['GET', '/admin/reports/monthly', (db, { query }) => {
    requireUser(db, 'Administrator')
    const year = Number(query.year)
    const month = Number(query.month)
    if (!(year >= 2000 && year <= 2100 && month >= 1 && month <= 12)) invalid('month', 'Enter a valid year and month.')
    const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => dailyReport(db, toIsoDate(new Date(year, month - 1, i + 1))))
    const sum = (key) => days.reduce((s, d) => s + d[key], 0)
    return { year, month, bookingsMade: sum('bookingsMade'), bookingsCompleted: sum('bookingsCompleted'), bookingsCancelled: sum('bookingsCancelled'),
      depositsCollected: sum('depositsCollected'), completedServicesValue: sum('completedServicesValue'), days }
  }],
  ['GET', '/admin/activity-logs', (db, { query }) => {
    requireUser(db, 'Administrator')
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50))
    const matches = db.auditLogs.filter((a) => !query.action || a.action === query.action)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    return {
      items: matches.slice((page - 1) * pageSize, page * pageSize).map((a) => ({ ...a, username: db.users.find((u) => u.id === a.userId)?.username ?? null })),
      page, pageSize, totalCount: matches.length,
    }
  }],
]

const compiled = routes.map(([method, pattern, handler]) => ({
  method, handler, names: [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1]),
  regex: new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`),
}))


/** Mock transport with the same signature as httpRequest(). */
export async function mockRequest(method, path, { body, query, file } = {}) {
  for (const route of compiled) {
    const match = route.method === method && route.regex.exec(path)
    if (!match) continue
    const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]))
    const result = await route.handler(getDb(), { params, query: query ?? {}, body: structuredClone(body ?? {}), file })
    const data = result && typeof result === 'object' && 'status' in result && 'data' in result ? result.data : result
    return data === null || data === undefined ? null : structuredClone(data)
  }
  fail(404, `Mock API has no route for ${method} ${path}.`, 'not_found')
}
