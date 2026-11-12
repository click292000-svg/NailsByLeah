import { config } from '../config'
import { httpRequest } from './http'
import { ApiError } from './errors'

// Every screen talks to the C# API through this object.

const unauthorizedListeners = new Set()

/** Called when any request (other than login) gets 401, e.g. after the server-side session expired. */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

async function call(method, path, options) {
  try {
    return await httpRequest(method, path, options)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && !path.startsWith('/auth/'))
      unauthorizedListeners.forEach((listener) => listener())
    throw error
  }
}

const get = (path, query) => call('GET', path, { query })
const post = (path, body = {}) => call('POST', path, { body })
const put = (path, body) => call('PUT', path, { body })
const del = (path) => call('DELETE', path)
const upload = (path, file, fields = {}) => {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value)
  return call('POST', path, { form, file, body: fields })
}

/**
 * Address of an uploaded design photo for <img src>. The real API serves it only to its owner and
 * administrators (session cookie). The test-only backend sends the photo itself as a data: URL.
 */
export const referenceImageUrl = (image) =>
  image.dataUrl ?? `${config.apiBaseUrl.replace(/\/$/, '')}/reference-images/${image.id}`

export const api = {
  /** The salon's public details: phone, payment account name, social links, bio and Leyah's photo. */
  salon: {
    get: () => get('/salon'),
  },
  /** Leyah's photos for the home page's Our Works gallery, newest first. */
  gallery: {
    list: () => get('/gallery'),
  },
  auth: {
    changePassword: (body) => post('/auth/change-password', body),
    signOutOtherDevices: () => post('/auth/sign-out-other-devices'),
    security: () => get('/auth/security'),
    register: (body) => post('/auth/register', body),
    usernameAvailability: (username) => get('/auth/username-availability', { username }),
    verifyEmail: (body) => post('/auth/verify-email', body),
    resendVerification: (email) => post('/auth/resend-verification', { email }),
    login: (body) => post('/auth/login', body),
    logout: () => post('/auth/logout'),
    me: () => get('/auth/me'),
    updateProfile: (body) => put('/auth/me', body),
    uploadPhoto: (file) => upload('/auth/me/photo', file),
    removePhoto: () => del('/auth/me/photo'),
    forgotPassword: (email) => post('/auth/forgot-password', { email }),
    validateResetToken: (token) => post('/auth/reset-password/validate', { token }),
    resetPassword: (body) => post('/auth/reset-password', body),
  },
  catalog: {
    get: () => get('/services'),
    /** Start times for a date; with a serviceId each time also says whether that service fits there. */
    slots: (date, serviceId, removalServiceId) =>
      get('/slots', { date, ...(serviceId && { serviceId }), ...(serviceId && removalServiceId && { removalServiceId }) }),
    /** Dates in the booking window that are closed all day. */
    closedDates: () => get('/slots/closed-dates'),
    hours: () => get('/salon-hours'),
    lookups: () => get('/lookups'),
  },
  bookings: {
    create: (body) => post('/bookings', body),
    history: () => get('/bookings'),
    get: (id) => get(`/bookings/${id}`),
    receipt: (id) => get(`/bookings/${id}/receipt`),
    reschedule: (id, body) => post(`/bookings/${id}/reschedule`, body),
    cancel: (id, body) => post(`/bookings/${id}/cancel`, body),
  },
  /** The booking the signed-in client started but hasn't paid for (null when there is none). */
  bookingDraft: {
    get: () => get('/booking-draft'),
    save: (data) => put('/booking-draft', { data }),
    remove: () => del('/booking-draft'),
  },
  feedback: {
    submit: (body) => post('/feedback', body),
    mine: () => get('/feedback'),
  },
  referenceImages: {
    upload: (file) => upload('/reference-images', file),
    pending: () => get('/reference-images/pending'),
    remove: (id) => del(`/reference-images/${id}`),
  },
  admin: {
    dashboard: (date) => get('/admin/dashboard', date ? { date } : undefined),
    searchBookings: (query) => get('/admin/bookings', query),
    /** Booking counts for each day of a month that has any: [{ date, count, activeCount }]. */
    bookingCalendar: (year, month) => get('/admin/bookings/calendar', { year, month }),
    receipt: (id) => get(`/admin/bookings/${id}/receipt`),
    salonSettings: () => get('/admin/salon-settings'),
    updateSalonSettings: (body) => put('/admin/salon-settings', body),
    uploadSalonPhoto: (file) => upload('/admin/salon-settings/photo', file),
    removeSalonPhoto: () => del('/admin/salon-settings/photo'),
    confirm: (id) => post(`/admin/bookings/${id}/confirm`),
    complete: (id, body) => post(`/admin/bookings/${id}/complete`, body),
    recordBalance: (id, body) => post(`/admin/bookings/${id}/balance`, body),
    recordRefund: (id, body) => post(`/admin/bookings/${id}/refund`, body),
    markNoShow: (id) => post(`/admin/bookings/${id}/no-show`),
    /** Leyah's answer to "Can't find your colour?": whether she has that shade. */
    decideColorRequest: (id, available) => post(`/admin/bookings/${id}/color-request`, { available }),
    reschedule: (id, body) => post(`/admin/bookings/${id}/reschedule`, body),
    cancel: (id, body) => post(`/admin/bookings/${id}/cancel`, body),
    services: () => get('/admin/services'),
    createService: (body) => post('/admin/services', body),
    updateService: (id, body) => put(`/admin/services/${id}`, body),
    deleteService: (id) => del(`/admin/services/${id}`),
    createAddOn: (body) => post('/admin/addons', body),
    updateAddOn: (id, body) => put(`/admin/addons/${id}`, body),
    deleteAddOn: (id) => del(`/admin/addons/${id}`),
    blockedSlots: (from, to) => get('/admin/blocked-slots', { from, to }),
    blockSlot: (body) => post('/admin/blocked-slots', body),
    unblockSlot: (id) => del(`/admin/blocked-slots/${id}`),
    salonHours: () => get('/admin/salon-hours'),
    updateSalonHours: (body) => put('/admin/salon-hours', body),
    dailyReport: (date) => get('/admin/reports/daily', { date }),
    monthlyReport: (year, month) => get('/admin/reports/monthly', { year, month }),
    activityLogs: (query) => get('/admin/activity-logs', query),
    feedback: (query) => get('/admin/feedback', query),
    findClient: (email) => post('/admin/clients/find', { email }),
    searchClients: (body) => post('/admin/clients/search', body),
    client: (id) => get(`/admin/clients/${id}`),
    updateBlockedSlot: (id, body) => put(`/admin/blocked-slots/${id}`, body),
    deleteClientData: (id) => post(`/admin/clients/${id}/delete-data`),
    /** Leyah's private note about a client; never shown to the client. */
    updateClientNote: (id, note) => put(`/admin/clients/${id}/note`, { note }),
    /** Leyah books for a client with an account (clientId) or a walk-in (guestName, guestPhone). */
    createBooking: (body) => post('/admin/bookings', body),
    bookingRules: () => get('/admin/booking-rules'),
    updateBookingRules: (body) => put('/admin/booking-rules', body),
    setColorStock: (color, inStock) => put('/admin/booking-rules/colors', { color, inStock }),
    replyToFeedback: (id, reply) => put(`/admin/feedback/${id}/reply`, { reply }),
    gallery: () => get('/admin/gallery'),
    addGalleryPhoto: (file, caption) => upload('/admin/gallery', file, { caption }),
    removeGalleryPhoto: (id) => del(`/admin/gallery/${id}`),
  },
}
