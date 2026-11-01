import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentPanel } from '../components/PaymentPanel'
import { CancelBookingDialog } from '../components/BookingDialogs'
import { CLIENT, renderApp, signIn } from './helpers'
import { dateFromToday } from '../lib/dates'
import { getDb } from '../mock/db'
import { lookups } from '../mock/data/lookups'

describe('Payment step', () => {
  it('keeps Pay disabled until "I understand" is checked (7.6)', async () => {
    const user = userEvent.setup()
    const onPay = vi.fn()
    render(<PaymentPanel deposit={150} onPay={onPay} />)

    expect(screen.getByText('The booking deposit is non-refundable.')).toBeInTheDocument()
    const pay = screen.getByRole('button', { name: /Pay/ })
    expect(pay).toBeDisabled()
    await user.click(pay)
    expect(onPay).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: 'I understand' }))
    expect(pay).toBeEnabled()
  })

  it('sends only one payment when Pay is clicked several times quickly (7.7)', async () => {
    let finish
    const onPay = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    render(<PaymentPanel deposit={150} onPay={onPay} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand' }))
    const pay = screen.getByRole('button', { name: /Pay/ })

    fireEvent.click(pay)
    fireEvent.click(pay)
    fireEvent.click(pay)

    expect(onPay).toHaveBeenCalledTimes(1)
    expect(pay).toBeDisabled()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    await act(async () => finish())
  })
})

describe('Administrator cancellation (7.8)', () => {
  it('can be submitted with a reason and no explanation', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue()
    const booking = { serviceName: 'Plain', bookingDate: '2026-12-01', startTime: '10:00:00' }
    render(<CancelBookingDialog booking={booking} reasons={lookups.adminCancellationReasons} allowExplanation onSubmit={onSubmit} onClose={() => {}} />)

    expect(screen.getByLabelText(/Explanation \(optional\)/)).not.toBeRequired()
    await user.selectOptions(screen.getByLabelText(/Reason for cancelling/), 'ScheduleConflict')
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'ScheduleConflict', explanation: null })
  })

  it('requires a reason', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const booking = { serviceName: 'Plain', bookingDate: '2026-12-01', startTime: '10:00:00' }
    render(<CancelBookingDialog booking={booking} reasons={lookups.adminCancellationReasons} allowExplanation onSubmit={onSubmit} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Select a cancellation reason.')).toBeInTheDocument()
  })

  it('offers exactly the client reasons from the requirements', () => {
    expect(lookups.clientCancellationReasons.map((r) => r.label))
      .toEqual(['Change of schedule', 'Emergency', 'Booked by mistake', 'Found another provider', 'Others'])
    expect(lookups.adminCancellationReasons.map((r) => r.label))
      .toEqual(['Staff unavailable', 'Schedule conflict', 'Emergency', 'Client did not respond', 'Others'])
  })
})

describe('Booking flow', () => {
  it('books with add-ons, updates the total live, pays and shows the receipt', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    // Step 1: service and add-ons; the total updates as they change (Ref 10.4).
    await user.click(await screen.findByRole('radio', { name: /With Design/ }))
    const total = () => within(screen.getByRole('complementary')).getByText('Total').nextSibling.textContent
    expect(total()).toBe('₱400.00')
    await user.click(screen.getByRole('checkbox', { name: /French Tip/ }))
    await user.click(screen.getByRole('button', { name: 'More nails for French Tip' }))
    await user.click(screen.getByRole('button', { name: 'More nails for French Tip' }))
    expect(screen.getByText('3 nails')).toBeInTheDocument()
    expect(total()).toBe('₱445.00')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Step 2: booked and blocked slots are disabled (Ref 10.1).
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: dateFromToday(5) } })
    expect(await screen.findByRole('button', { name: /12:00.*Booked/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: dateFromToday(3) } })
    await user.click(await screen.findByRole('button', { name: /10:00.*Available/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Step 3: note chips (Ref 2.4).
    await user.click(screen.getByRole('radio', { name: "I'll bring a reference photo" }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Step 4: summary and payment.
    expect(screen.getByRole('heading', { name: 'Booking summary' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    await user.click(screen.getByRole('checkbox', { name: 'I understand' }))
    await user.click(screen.getByRole('button', { name: /Pay/ }))

    expect(await screen.findByRole('heading', { name: "You're booked!" })).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    const payment = getDb().payments.at(-1)
    expect(screen.getByText(payment.referenceNumber)).toBeInTheDocument()
    expect(payment.method).toBe('Maya')
    expect(getDb().bookings.at(-1)).toMatchObject({ bookingDate: dateFromToday(3), startTime: '10:00:00', status: 'Confirmed' })
  })

  it('disables Reschedule for appointments less than 24 hours away (Ref 10.6)', async () => {
    // Move Kyla's seeded booking #8 to two hours from now.
    const soon = new Date(Date.now() + 2 * 3_600_000)
    const booking = getDb().bookings.find((b) => b.id === 8)
    booking.bookingDate = dateFromToday(soon.getDate() === new Date().getDate() ? 0 : 1)
    booking.startTime = `${String(soon.getHours()).padStart(2, '0')}:00:00`

    await signIn(CLIENT)
    renderApp('/bookings')

    expect(await screen.findByText('Rescheduling is only possible at least 24 hours before your appointment.')).toBeInTheDocument()
  })
})
