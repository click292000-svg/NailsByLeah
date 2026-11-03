import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn, pickDate } from './helpers'
import { getDb } from './mockBackend/db'
import { mockRequest } from './mockBackend/mockApi'
import { dateFromToday } from '../lib/dates'
import { users } from './mockBackend/data/users'
import { formatDate } from '../lib/format'

describe('Customer feedback', () => {
  it('saves a 5-star rating without a comment and thanks the client', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/feedback')

    await user.click(await screen.findByRole('radio', { name: /5 stars/ }))
    await user.click(screen.getByRole('button', { name: 'Submit feedback' }))

    expect(await screen.findByText('Thank you for your feedback!')).toBeInTheDocument()
    expect(getDb().feedback.at(-1)).toMatchObject({ clientId: 2, rating: 5, comment: null })
  })

  it('needs a star rating before it can be submitted', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/feedback')
    const before = getDb().feedback.length

    await user.type(await screen.findByLabelText(/Comments or suggestions/), 'Lovely!')
    await user.click(screen.getByRole('button', { name: 'Submit feedback' }))

    expect(screen.getByText('Choose a rating from 1 to 5 stars.')).toBeInTheDocument()
    expect(getDb().feedback).toHaveLength(before)
  })

  it('saves repeated submissions of the same form once', async () => {
    await signIn(CLIENT)
    const body = { rating: 4, comment: 'Great', submissionKey: crypto.randomUUID() }
    const before = getDb().feedback.length

    await mockRequest('POST', '/feedback', { body })
    await mockRequest('POST', '/feedback', { body })

    expect(getDb().feedback).toHaveLength(before + 1)
  })

  it('shows the administrator every rating with the average', async () => {
    await signIn(ADMIN)
    renderApp('/admin/feedback')

    expect(await screen.findByRole('heading', { name: 'Customer feedback' })).toBeInTheDocument()
    expect(screen.getByText('Love my chrome French tips, so neat!')).toBeInTheDocument()
    expect(screen.getByText('4.7')).toBeInTheDocument() // seeded 5, 4 and 5 stars
    expect(screen.getAllByText('No comment').length).toBeGreaterThan(0)
  })
})

describe('Open, Booked and Closed times', () => {
  it('a time the administrator closes shows as Closed and cannot be chosen', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    await mockRequest('POST', '/admin/blocked-slots', { body: { date: dateFromToday(4), startTime: '14:00:00', reason: 'Break' } })

    await signIn(CLIENT)
    renderApp('/book')
    await user.click(await screen.findByRole('radio', { name: /Plain/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    pickDate(dateFromToday(4))

    expect(await screen.findByRole('button', { name: /^2:00.*Closed/ })).toBeDisabled()
    await expect(mockRequest('POST', '/bookings', { body: {
      serviceId: 1, addOns: [], bookingDate: dateFromToday(4), startTime: '14:00:00',
      paymentMethod: 'GCash', depositAcknowledged: true, idempotencyKey: crypto.randomUUID(),
    } })).rejects.toMatchObject({ status: 409, code: 'slot_unavailable' })
  })

  it('the administrator closes and reopens times by clicking them, and booked times cannot be changed', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    await mockRequest('POST', '/admin/blocked-slots', { body: { date: dateFromToday(5), startTime: '17:00:00', reason: null } })
    renderApp('/admin/schedule')
    const day = dateFromToday(5)
    if (day.slice(0, 7) !== dateFromToday(0).slice(0, 7)) await user.click(await screen.findByRole('button', { name: 'Next month' }))
    await user.click(await screen.findByRole('gridcell', { name: new RegExp(`^${formatDate(day)}`) }))

    const grid = await screen.findByRole('group', { name: 'Times' })
    const tile = (time) => within(grid).getByRole('button', { name: new RegExp(`^${time},`) })
    await waitFor(() => expect(tile('5:00 PM')).toHaveAccessibleName(/Closed/))
    // Seeded booking #10 is at 1:00 PM on this day.
    expect(tile('1:00 PM')).toHaveAccessibleName(/Booked/)
    expect(tile('1:00 PM')).toBeDisabled()

    await user.click(tile('5:00 PM'))
    await waitFor(() => expect(tile('5:00 PM')).toHaveAccessibleName(/Open/))
    await user.click(tile('6:00 PM'))
    await waitFor(() => expect(tile('6:00 PM')).toHaveAccessibleName(/Closed/))
  })
})

describe('Hands for Stone add-ons', () => {
  it('Stone add-ons are switched off for a removal', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('radio', { name: /With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Chrome/ }))
    await user.click(screen.getByRole('radio', { name: /^My Work/ }))

    expect(screen.getByText(/aren.t available with a removal/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Chrome/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Chrome/ })).not.toBeChecked()
  })

  it('one hand stops at 5 nails; more needs both hands', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')
    await user.click(await screen.findByRole('radio', { name: /With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Chrome/ }))
    await user.click(screen.getByRole('radio', { name: 'Left hand' }))

    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'More nails for Chrome' }))
    expect(screen.getByText('5 nails')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More nails for Chrome' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Both hands' }))
    await user.click(screen.getByRole('button', { name: 'More nails for Chrome' }))
    expect(screen.getByText('6 nails')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Left hand' })).toBeDisabled()
  })
})

describe('Booking drafts', () => {
  it('keeps the service, add-on and hand when going back and after leaving, and offers Continue booking', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    const first = renderApp('/book')

    await user.click(await screen.findByRole('radio', { name: /With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Chrome/ }))
    await user.click(screen.getByRole('radio', { name: 'Right hand' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: /Back to service/ }))

    // Going back keeps every choice.
    expect(screen.getByRole('radio', { name: /With Design/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Right hand' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(getDb().bookingDrafts.find((d) => d.clientId === 2)?.data).toMatchObject({ step: 1, serviceId: 2, hands: { 2: 'Right' } }))
    first.unmount()

    // It is a draft, not a booking: no appointment was created, and My bookings offers to continue it.
    expect(getDb().bookings.filter((b) => b.clientId === 2 && b.serviceId === 2 && b.status === 'Pending')).toHaveLength(0)
    const second = renderApp('/bookings')
    const card = await screen.findByRole('region', { name: 'Unfinished booking' })
    expect(within(card).getByText('Draft')).toBeInTheDocument()
    expect(within(card).getByText('With Design')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Continue booking' })).toHaveAttribute('href', '/book')
    second.unmount()

    renderApp('/book')
    expect(await screen.findByText(/We restored the booking you saved as a draft/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Back to service/ }))
    expect(screen.getByRole('radio', { name: 'Right hand' })).toHaveAttribute('aria-checked', 'true')
    expect(within(screen.getByRole('complementary')).getByText(/Chrome — Right hand/)).toBeInTheDocument()
  })

  it('drafts belong to their own client', async () => {
    await signIn(CLIENT)
    await mockRequest('PUT', '/booking-draft', { body: { data: { version: 2, serviceId: 1 } } })
    const maria = users.find((u) => u.username === 'maria.dc')
    await signIn({ username: maria.username, password: maria.password })

    expect(await mockRequest('GET', '/booking-draft')).toBeNull()
    await signIn(ADMIN)
    await expect(mockRequest('GET', '/booking-draft')).rejects.toMatchObject({ status: 403 })
  })
})

describe('Deposit or full payment', () => {
  it('a paid booking stays Pending until the administrator verifies and confirms it', async () => {
    // The first day from 6 days ahead where 3:00 PM is open for this 90-minute service.
    let ahead = 6
    const openAt3 = async (day) => (await mockRequest('GET', '/slots', { query: { date: dateFromToday(day), serviceId: 2 } }))
      .slots.some((s) => s.startTime === '15:00:00' && s.status === 'Open')
    while (!(await openAt3(ahead))) ahead++
    await signIn(CLIENT)
    const { booking } = await mockRequest('POST', '/bookings', { body: {
      serviceId: 2, addOns: [{ addOnId: 2, nailCount: 2, hand: 'Right' }], bookingDate: dateFromToday(ahead), startTime: '15:00:00',
      paymentMethod: 'GCash', paymentOption: 'Full', depositAcknowledged: true, idempotencyKey: crypto.randomUUID(),
    } })
    expect(booking).toMatchObject({ status: 'Pending', totalPrice: 420, balanceDue: 0, payment: { option: 'Full', amountPaid: 420, verified: false } })

    await signIn(ADMIN)
    const confirmed = await mockRequest('POST', `/admin/bookings/${booking.id}/confirm`)
    expect(confirmed).toMatchObject({ status: 'Confirmed', payment: { verified: true, confirmedBy: 'Leyah Reyes' } })
    expect(getDb().outbox[0].subject).toBe('Your Nails by Leyah booking is confirmed') // newest first
    await expect(mockRequest('POST', `/admin/bookings/${booking.id}/confirm`)).rejects.toMatchObject({ status: 409 })
  })
})
