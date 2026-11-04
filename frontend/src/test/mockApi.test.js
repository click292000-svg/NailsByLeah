import { mockRequest as call } from './mockBackend/mockApi'
import { getDb } from './mockBackend/db'
import { dateFromToday } from '../lib/dates'
import { calculateQuote } from '../lib/pricing'
import { validateRegistration } from '../validation/rules'
import { ADMIN, CLIENT, signIn } from './helpers'

const booking = (overrides = {}) => ({
  serviceId: 1, addOns: [], bookingDate: dateFromToday(3), startTime: '13:00:00',
  paymentMethod: 'GCash', depositAcknowledged: true, idempotencyKey: crypto.randomUUID(), ...overrides,
})

describe('Shared rules', () => {
  it('prices Stone add-ons per nail and deducts the deposit from the total', () => {
    const quote = calculateQuote({ id: 2, name: 'With Design', price: 400 },
      [{ addOn: { id: 1, name: 'French Tip', price: 15 }, nailCount: 10 }, { addOn: { id: 2, name: 'Chrome', price: 10 }, nailCount: 2 }], 150)
    expect(quote).toMatchObject({ total: 570, deposit: 150, balanceDue: 420 })
  })

  it('validates registration with the same limits as the backend', () => {
    const errors = validateRegistration({ firstName: 'x'.repeat(76), lastName: '', username: 'ab', email: 'nope',
      phoneNumber: 'abc#', password: 'short', confirmPassword: 'other', acceptTerms: false })
    expect(Object.keys(errors).sort()).toEqual(['acceptTerms', 'confirmPassword', 'email', 'firstName', 'lastName', 'password', 'phoneNumber', 'username'])
  })
})

describe('Mock backend', () => {
  it('rejects payment without the deposit acknowledgment', async () => {
    await signIn(CLIENT)
    await expect(call('POST', '/bookings', { body: booking({ depositAcknowledged: false }) }))
      .rejects.toMatchObject({ status: 400, code: 'deposit_not_acknowledged' })
  })

  it('lets only one client book a slot', async () => {
    await signIn(CLIENT)
    await call('POST', '/bookings', { body: booking() })
    await signIn({ username: 'ana_lim', password: 'ClientPass123' })
    await expect(call('POST', '/bookings', { body: booking() })).rejects.toMatchObject({ status: 409, code: 'slot_unavailable' })
  })

  it('opens at 11:00 AM and keeps a 30-minute break after every appointment', async () => {
    await signIn(CLIENT)
    await expect(call('POST', '/bookings', { body: booking({ startTime: '10:30:00' }) }))
      .rejects.toMatchObject({ status: 400, errors: { startTime: ["Appointments can't start before the 11:00 AM opening time."] } })

    // Plain takes 60 minutes: 11:00 → 12:00, so the next appointment can start at 12:30.
    const { booking: first } = await call('POST', '/bookings', { body: booking({ startTime: '11:00:00' }) })
    expect(first).toMatchObject({ endTime: '12:00:00', durationMinutes: 60 })
    const day = await call('GET', '/slots', { query: { date: dateFromToday(3), serviceId: '1' } })
    expect(day.slots.find((s) => s.startTime === '12:00:00')).toMatchObject({ status: 'Break', note: 'Break until 12:30 PM' })
    expect(day.slots.find((s) => s.startTime === '12:30:00').status).toBe('Open')

    await signIn({ username: 'ana_lim', password: 'ClientPass123' })
    await expect(call('POST', '/bookings', { body: booking({ startTime: '12:00:00' }) })).rejects.toMatchObject({ status: 409, code: 'slot_unavailable' })
    await call('POST', '/bookings', { body: booking({ startTime: '12:30:00' }) })
  })

  it('lets the administrator change the closing time, but never cut a booking short', async () => {
    await signIn(CLIENT)
    await call('POST', '/bookings', { body: booking({ startTime: '19:00:00' }) }) // ends 8:00 PM
    expect(await call('GET', '/salon-hours')).toMatchObject({ openingTime: '11:00:00', closingTime: '21:00:00', bufferMinutes: 30 })

    await signIn(ADMIN)
    await expect(call('PUT', '/admin/salon-hours', { body: { closingTime: '19:30:00' } })).rejects.toMatchObject({ code: 'has_active_bookings' })
    await call('PUT', '/admin/salon-hours', { body: { closingTime: '20:00:00' } })
    const day = await call('GET', '/slots', { query: { date: dateFromToday(4), serviceId: '1' } })
    expect(day.slots.at(-1)).toMatchObject({ startTime: '19:30:00', status: 'TooShort' })
  })

  it('charges once when the same payment is sent twice', async () => {
    await signIn(CLIENT)
    const request = booking()
    const [first, second] = await Promise.all([call('POST', '/bookings', { body: request }), call('POST', '/bookings', { body: request })])
    expect(second.booking.id).toBe(first.booking.id)
    expect(getDb().payments.filter((p) => p.idempotencyKey === request.idempotencyKey)).toHaveLength(1)
  })

  it('leaves nothing behind when the payment fails', async () => {
    await signIn(CLIENT)
    getDb().flags.failNextPayment = true
    const before = getDb().bookings.length
    await expect(call('POST', '/bookings', { body: booking() })).rejects.toMatchObject({ status: 402 })
    expect(getDb().bookings).toHaveLength(before)
  })

  it('locks the account after five wrong passwords', async () => {
    for (let i = 0; i < 4; i++)
      await expect(call('POST', '/auth/login', { body: { usernameOrEmail: 'kyla', password: 'wrong' } })).rejects.toMatchObject({ status: 401 })
    await expect(call('POST', '/auth/login', { body: { usernameOrEmail: 'kyla', password: 'wrong' } })).rejects.toMatchObject({ status: 423 })
    await expect(signIn(CLIENT)).rejects.toMatchObject({ code: 'account_locked' })
  })

  it('refuses rescheduling within 24 hours', async () => {
    await signIn(CLIENT)
    const soon = getDb().bookings.find((b) => b.id === 8)
    soon.bookingDate = dateFromToday(0)
    soon.startTime = '23:00:00'
    await expect(call('POST', '/bookings/8/reschedule', { body: { bookingDate: dateFromToday(3), startTime: '11:00:00' } }))
      .rejects.toMatchObject({ code: 'reschedule_window_passed' })
  })

  it('end to end: sign up, book, pay, cancel, administrator sees the cancellation (7.11)', async () => {
    await call('POST', '/auth/register', { body: { firstName: 'Kim', lastName: 'Uy', username: 'kim.uy', email: 'kim@example.test',
      phoneNumber: '09335556677', password: 'KimPass123', confirmPassword: 'KimPass123', acceptTerms: true } })
    const code = getDb().outbox.find((e) => e.to === 'kim@example.test').code
    await call('POST', '/auth/verify-email', { body: { email: 'kim@example.test', code } })
    await signIn({ username: 'kim.uy', password: 'KimPass123' })

    const { booking: created, receipt } = await call('POST', '/bookings', { body: booking({ serviceId: 3, addOns: [{ addOnId: 5, nailCount: 2, hand: 'Right' }] }) })
    expect(created).toMatchObject({ status: 'Pending', totalPrice: 280, balanceDue: 130 }) // deposit paid; Leyah confirms later
    expect(receipt.referenceNumber).toMatch(/^GC-/)
    await call('POST', `/bookings/${created.id}/cancel`, { body: { reason: 'ChangeOfSchedule' } })

    await signIn(ADMIN)
    const seen = await call('GET', `/admin/bookings/${created.id}`)
    expect(seen.status).toBe('Cancelled')
    expect(seen.cancellation).toMatchObject({ reasonLabel: 'Change of schedule', cancelledByRole: 'Client' })
    expect(seen.client.username).toBe('kim.uy')
  })
})
