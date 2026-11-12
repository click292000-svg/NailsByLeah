import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn, pickDate, pickShade } from './helpers'
import { getDb } from './mockBackend/db'
import { mockRequest } from './mockBackend/mockApi'
import { dateFromToday } from '../lib/dates'
import { users } from './mockBackend/data/users'
import { formatDate } from '../lib/format'
import { termsAndConditions } from '../content/legal'

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
    await user.click(await screen.findByRole('checkbox', { name: /Plain/ }))
    await pickShade(user, '06')
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    pickDate(dateFromToday(4))

    expect(await screen.findByRole('button', { name: /^2:00.*Closed/ })).toBeDisabled()
    await expect(mockRequest('POST', '/bookings', { body: {
      serviceId: 1, addOns: [], bookingDate: dateFromToday(4), startTime: '14:00:00', nailColor: '#06', termsVersion: termsAndConditions.version,
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

describe('Changing a closed time', () => {
  it('the administrator moves a closed period and the client calendar and times follow', async () => {
    const user = userEvent.setup()
    const day = dateFromToday(12)
    await signIn(ADMIN)
    await mockRequest('POST', '/admin/blocked-slots', { body: { date: day, startTime: '11:00:00', endTime: '12:00:00', reason: 'Errand' } })
    renderApp('/admin/schedule')
    if (day.slice(0, 7) !== dateFromToday(0).slice(0, 7)) await user.click(await screen.findByRole('button', { name: 'Next month' }))
    await user.click(await screen.findByRole('gridcell', { name: new RegExp(`^${formatDate(day)}`) }))

    await user.click(await screen.findByRole('button', { name: /^Change 11:00 AM – 12:00 PM/ }))
    const form = screen.getByRole('form', { name: 'Change closed time' })
    await user.selectOptions(within(form).getByLabelText('Close from'), '15:00:00')
    await user.selectOptions(within(form).getByLabelText('Until'), '16:00:00')
    await user.clear(within(form).getByLabelText(/Reason/))
    await user.type(within(form).getByLabelText(/Reason/), 'Dentist')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Closed time changed to 3:00 PM – 4:00 PM.')).toBeInTheDocument()
    const grid = await screen.findByRole('group', { name: 'Times' })
    await waitFor(() => expect(within(grid).getByRole('button', { name: /^3:30 PM,/ })).toHaveAccessibleName(/Closed/))
    expect(within(grid).getByRole('button', { name: /^11:00 AM,/ })).toHaveAccessibleName(/Open/)
    expect(getDb().blockedSlots.filter((b) => b.date === day && !b.isDeleted)).toHaveLength(1)
  })

  it('a day closed all day is crossed out on the client calendar', async () => {
    const day = dateFromToday(13)
    await signIn(ADMIN)
    await mockRequest('POST', '/admin/blocked-slots', { body: { date: day, startTime: null, reason: 'Holiday' } })
    await signIn(CLIENT)
    const user = userEvent.setup()
    renderApp('/book')
    await user.click(await screen.findByRole('checkbox', { name: /^My Work/ }))
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    if (day.slice(0, 7) !== dateFromToday(0).slice(0, 7)) await user.click(await screen.findByRole('button', { name: 'Next month' }))

    const closed = await screen.findByRole('radio', { name: `${formatDate(day)}, closed` })
    expect(closed).toBeDisabled()
  })
})

describe('Hands for Stone add-ons', () => {
  it('Stones are switched off and cleared for Plain', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Chrome/ }))
    // Unticking "With design" leaves Plain on its own.
    await user.click(screen.getByRole('checkbox', { name: /^With Design/ }))
    expect(screen.getByRole('checkbox', { name: /^Plain/ })).toBeChecked()

    expect(screen.getByText(/Nail art isn.t available with Plain/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Chrome/ })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Chrome/ })).not.toBeChecked()
    expect(within(screen.getByRole('complementary')).queryByText(/Chrome/)).toBeNull() // not charged

    // Back to With Design: the earlier Chrome is gone, not quietly restored.
    await user.click(screen.getByRole('checkbox', { name: /^With Design/ }))
    expect(screen.getByRole('checkbox', { name: /Chrome/ })).not.toBeChecked()
  })

  it('a removal goes with a new set in one appointment, both charged and timed', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /^My Work/ }))
    const aside = within(screen.getByRole('complementary'))
    expect(aside.getByText('Removal – My Work')).toBeInTheDocument()
    expect(aside.getByText('Total').nextSibling).toHaveTextContent('₱500.00')
    expect(aside.getByText('~ 4 hr')).toBeInTheDocument()

    // Only one removal at a time, and a removal alone needs no colour.
    await user.click(screen.getByRole('checkbox', { name: /^Not My Work/ }))
    expect(screen.getByRole('checkbox', { name: /^My Work/ })).not.toBeChecked()
    // A second tap on the Plain card un-chooses the set, design and all.
    await user.click(screen.getByRole('checkbox', { name: /^Plain/ }))
    expect(screen.queryByRole('radiogroup', { name: 'Nail colour' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    expect(await screen.findByRole('radiogroup', { name: /Choose a date/ })).toBeInTheDocument()
  })

  it('choosing a hand fills its nails: both hands 10, one hand 5 and no more', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')
    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Chrome/ }))
    expect(screen.getByText('10 nails')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More nails for Chrome' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Left hand' }))
    expect(screen.getByText('5 nails')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More nails for Chrome' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Fewer nails for Chrome' }))
    expect(screen.getByText('4 nails')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Both hands' }))
    expect(screen.getByText('10 nails')).toBeInTheDocument()
  })
})

describe('Booking drafts', () => {
  it('keeps the service, add-on and hand when going back and after leaving, and offers Continue booking', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    const first = renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Chrome/ }))
    await user.click(screen.getByRole('radio', { name: 'Right hand' }))
    await pickShade(user, '46')
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    await user.click(screen.getByRole('button', { name: /Back to service/ }))

    // Going back keeps every choice.
    expect(screen.getByRole('checkbox', { name: /^With Design/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Right hand' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Colour #46 – Plum-Grey. Change colour' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    await waitFor(() => expect(getDb().bookingDrafts.find((d) => d.clientId === 2)?.data).toMatchObject({ step: 1, serviceId: 2, color: '#46', hands: { 2: 'Right' } }))
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
    expect(within(screen.getByRole('complementary')).getByText(/Right hand · /)).toBeInTheDocument()
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
    // The first day from 6 days ahead where 3:00 PM is open for this 3-hour service.
    let ahead = 6
    const openAt3 = async (day) => (await mockRequest('GET', '/slots', { query: { date: dateFromToday(day), serviceId: 2 } }))
      .slots.some((s) => s.startTime === '15:00:00' && s.status === 'Open')
    while (!(await openAt3(ahead))) ahead++
    await signIn(CLIENT)
    const { booking } = await mockRequest('POST', '/bookings', { body: {
      serviceId: 2, addOns: [{ addOnId: 2, nailCount: 2, hand: 'Right' }], bookingDate: dateFromToday(ahead), startTime: '15:00:00',
      paymentMethod: 'GCash', paymentOption: 'Full', depositAcknowledged: true, idempotencyKey: crypto.randomUUID(),
      nailColor: '#51', termsVersion: termsAndConditions.version,
    } })
    expect(booking).toMatchObject({ status: 'Pending', totalPrice: 420, balanceDue: 0, payment: { option: 'Full', amountPaid: 420, verified: false } })

    await signIn(ADMIN)
    const confirmed = await mockRequest('POST', `/admin/bookings/${booking.id}/confirm`)
    expect(confirmed).toMatchObject({ status: 'Confirmed', payment: { verified: true, confirmedBy: 'Leyah Reyes' } })
    expect(getDb().outbox[0].subject).toBe('Your Nails by Leyah booking is confirmed') // newest first
    await expect(mockRequest('POST', `/admin/bookings/${booking.id}/confirm`)).rejects.toMatchObject({ status: 409 })
  })
})
