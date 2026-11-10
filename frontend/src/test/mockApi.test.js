import { mockRequest as call } from './mockBackend/mockApi'
import { getDb } from './mockBackend/db'
import { dateFromToday } from '../lib/dates'
import { calculateQuote } from '../lib/pricing'
import { validatePhone, validateRegistration } from '../validation/rules'
import { termsAndConditions } from '../content/legal'
import { ADMIN, CLIENT, signIn } from './helpers'

const booking = (overrides = {}) => ({
  serviceId: 1, addOns: [], bookingDate: dateFromToday(3), startTime: '13:00:00',
  paymentMethod: 'GCash', depositAcknowledged: true, idempotencyKey: crypto.randomUUID(),
  nailColor: '#06', termsVersion: termsAndConditions.version, ...overrides,
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

    // Plain takes 2 hours: 11:00 → 1:00 PM, so the next appointment can start at 1:30 PM.
    const { booking: first } = await call('POST', '/bookings', { body: booking({ startTime: '11:00:00' }) })
    expect(first).toMatchObject({ endTime: '13:00:00', durationMinutes: 120 })
    const day = await call('GET', '/slots', { query: { date: dateFromToday(3), serviceId: '1' } })
    expect(day.slots.find((s) => s.startTime === '13:00:00')).toMatchObject({ status: 'Break', note: 'Break until 1:30 PM' })
    expect(day.slots.find((s) => s.startTime === '13:30:00').status).toBe('Open')

    await signIn({ username: 'ana_lim', password: 'ClientPass123' })
    await expect(call('POST', '/bookings', { body: booking({ startTime: '13:00:00' }) })).rejects.toMatchObject({ status: 409, code: 'slot_unavailable' })
    await call('POST', '/bookings', { body: booking({ startTime: '13:30:00' }) })
  })

  it('lets the administrator change the closing time, but never cut a booking short', async () => {
    await signIn(CLIENT)
    await call('POST', '/bookings', { body: booking({ startTime: '18:00:00' }) }) // ends 8:00 PM
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

  it('needs the current Terms version, a listed colour, and no add-ons with Plain', async () => {
    await signIn(CLIENT)
    await expect(call('POST', '/bookings', { body: booking({ termsVersion: '0.1' }) })).rejects.toMatchObject({ code: 'terms_outdated' })
    await expect(call('POST', '/bookings', { body: booking({ nailColor: 'Gold' }) })).rejects.toMatchObject({ status: 400 })
    await expect(call('POST', '/bookings', { body: booking({ addOns: [{ addOnId: 2, nailCount: 1, hand: 'Both' }] }) }))
      .rejects.toMatchObject({ status: 400 })
  })

  it('books a removal before a new set as one longer appointment', async () => {
    await signIn(CLIENT)
    const day = await call('GET', '/slots', { query: { date: dateFromToday(20), serviceId: '2', removalServiceId: '4' } })
    expect(day.durationMinutes).toBe(240)
    const { booking: created } = await call('POST', '/bookings', { body: booking({ serviceId: 2, removalServiceId: 4, bookingDate: dateFromToday(20), startTime: '11:00:00' }) })
    expect(created).toMatchObject({ durationMinutes: 240, endTime: '15:00:00', totalPrice: 500, removalServiceName: 'My Work' })
  })

  it('lists dates closed all day, and asks "Others" for a reason', async () => {
    await signIn(ADMIN)
    await call('POST', '/admin/blocked-slots', { body: { date: dateFromToday(21), startTime: null, reason: 'Holiday' } })
    expect(await call('GET', '/slots/closed-dates')).toContain(dateFromToday(21))

    await signIn(CLIENT)
    const { booking: created } = await call('POST', '/bookings', { body: booking({ bookingDate: dateFromToday(22) }) })
    await expect(call('POST', `/bookings/${created.id}/cancel`, { body: { reason: 'Others', explanation: ' ' } })).rejects.toMatchObject({ status: 400 })
    await call('POST', `/bookings/${created.id}/cancel`, { body: { reason: 'Others', explanation: 'Moving abroad' } })
    await signIn(ADMIN)
    expect((await call('GET', `/admin/bookings/${created.id}`)).cancellation.explanation).toBe('Moving abroad')
  })

  it('accepts 09 and +639 mobile numbers only', () => {
    expect(validatePhone('09171234567')).toBeNull()
    expect(validatePhone('+639171234567')).toBeNull()
    expect(validatePhone('08171234567')).toMatch(/09 or \+639/)
    expect(validatePhone('+63917123456')).toMatch(/too short/)
    expect(validatePhone('0917-123-4567')).toMatch(/only contain numbers/)
  })

  it('end to end: sign up, book, pay, cancel, administrator sees the cancellation (7.11)', async () => {
    await call('POST', '/auth/register', { body: { firstName: 'Kim', lastName: 'Uy', username: 'kim.uy', email: 'kim@example.test',
      phoneNumber: '09335556677', password: 'KimPass123', confirmPassword: 'KimPass123', acceptTerms: true } })
    const code = getDb().outbox.find((e) => e.to === 'kim@example.test').code
    await call('POST', '/auth/verify-email', { body: { email: 'kim@example.test', code } })
    await signIn({ username: 'kim.uy', password: 'KimPass123' })

    const { booking: created, receipt } = await call('POST', '/bookings', { body: booking({ serviceId: 3, addOns: [{ addOnId: 5, nailCount: 2, hand: 'Right' }] }) })
    expect(created).toMatchObject({ status: 'Pending', totalPrice: 280, balanceDue: 130, nailColor: '#06' }) // deposit paid; Leyah confirms later
    expect(receipt.referenceNumber).toMatch(/^GC-/)
    await call('POST', `/bookings/${created.id}/cancel`, { body: { reason: 'ChangeOfSchedule' } })

    await signIn(ADMIN)
    const seen = await call('GET', `/admin/bookings/${created.id}`)
    expect(seen.status).toBe('Cancelled')
    expect(seen.cancellation).toMatchObject({ reasonLabel: 'Change of schedule', cancelledByRole: 'Client' })
    expect(seen.client.username).toBe('kim.uy')
  })
})
