import { config } from '../config'
import { httpRequest } from './http'
import { mockRequest } from '../mock/mockApi'
import { ApiError } from './errors'

// Every screen talks to the backend through this object. The transport is the real C# API
// or the in-browser mock (src/mock), chosen by VITE_USE_MOCK_API. Paths and response shapes are identical.
const transport = config.useMockApi ? mockRequest : httpRequest

const unauthorizedListeners = new Set()

/** Called when any request (other than login) gets 401, e.g. after the server-side session expired. */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

async function call(method, path, options) {
  try {
    return await transport(method, path, options)
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
    validateResetToken: (token) => get('/auth/reset-password/validate', { token }),
    resetPassword: (body) => post('/auth/reset-password', body),
  },
  catalog: {
    get: () => get('/services'),
    quote: (body) => post('/pricing/quote', body),
    slots: (date) => get('/slots', { date }),
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
  admin: {
    dashboard: () => get('/admin/dashboard'),
    searchBookings: (query) => get('/admin/bookings', query),
    getBooking: (id) => get(`/admin/bookings/${id}`),
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
    dailyReport: (date) => get('/admin/reports/daily', { date }),
    monthlyReport: (year, month) => get('/admin/reports/monthly', { year, month }),
    activityLogs: (query) => get('/admin/activity-logs', query),
  },
}
