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
const upload = (path, file) => {
  const form = new FormData()
  form.append('file', file)
  return call('POST', path, { form, file })
}

/**
 * Address of an uploaded design photo for <img src>. The real API serves it only to its owner and
 * administrators (session cookie). The test-only backend sends the photo itself as a data: URL.
 */
export const referenceImageUrl = (image) =>
  image.dataUrl ?? `${config.apiBaseUrl.replace(/\/$/, '')}/reference-images/${image.id}`

export const api = {
  auth: {
    register: (body) => post('/auth/register', body),
    usernameAvailability: (username) => get('/auth/username-availability', { username }),
    verifyEmail: (body) => post('/auth/verify-email', body),
    resendVerification: (email) => post('/auth/resend-verification', { email }),
    login: (body) => post('/auth/login', body),
    logout: () => post('/auth/logout'),
    me: () => get('/auth/me'),
    forgotPassword: (email) => post('/auth/forgot-password', { email }),
    validateResetToken: (token) => post('/auth/reset-password/validate', { token }),
    resetPassword: (body) => post('/auth/reset-password', body),
  },
  catalog: {
    get: () => get('/services'),
    /** Start times for a date; with a serviceId each time also says whether that service fits there. */
    slots: (date, serviceId) => get('/slots', serviceId ? { date, serviceId } : { date }),
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
    dashboard: () => get('/admin/dashboard'),
    searchBookings: (query) => get('/admin/bookings', query),
    confirm: (id) => post(`/admin/bookings/${id}/confirm`),
    complete: (id) => post(`/admin/bookings/${id}/complete`),
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
    deleteClientData: (id) => post(`/admin/clients/${id}/delete-data`),
  },
}
