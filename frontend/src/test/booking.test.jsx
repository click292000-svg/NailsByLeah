import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentPanel } from '../components/PaymentPanel'
import { CancelBookingDialog } from '../components/BookingDialogs'
import { CLIENT, readTermsAndAgree, renderApp, signIn, pickDate, pickShade } from './helpers'
import { dateFromToday } from '../lib/dates'
import { getDb } from './mockBackend/db'
import { lookups } from './mockBackend/data/lookups'

// With Design (₱400) + Chrome × 2 (₱20): a ₱150 deposit or ₱420 in full.
const QUOTE = { total: 420, deposit: 150, fullAmount: 420, balanceDue: 270, lines: [] }
const panel = (props) => <PaymentPanel quote={QUOTE} option="Deposit" onOptionChange={() => {}} {...props} />

describe('Payment step', () => {
  it('keeps Pay disabled until the booking policy is accepted (7.6)', async () => {
    const user = userEvent.setup()
    const onPay = vi.fn()
    render(panel({ onPay }))

    expect(screen.getByRole('note')).toHaveTextContent('₱150.00 booking depositNon-refundable for cancellations and no-shows. This amount is deducted from your total service cost.')
    expect(screen.getByText('Please accept the booking policy to continue.')).toBeInTheDocument()
    const pay = screen.getByRole('button', { name: /Pay/ })
    expect(pay).toBeDisabled()
    await user.click(pay)
    expect(onPay).not.toHaveBeenCalled()

    // The box can't be ticked before the Terms have been opened and read to the end.
    const agree = screen.getByRole('checkbox', { name: /I have read and agree to the booking policies/ })
    expect(agree).toBeDisabled()
    expect(screen.getByRole('button', { name: /Review booking policies/ })).toHaveTextContent('Required before payment')
    await user.click(agree.closest('label'))
    expect(screen.getByText('Please open and read the booking policies to the end first.')).toBeInTheDocument()

    await readTermsAndAgree(user)
    expect(pay).toBeEnabled()
  })

  it('opens the Terms & Conditions without ticking the box or leaving the page', async () => {
    const user = userEvent.setup()
    render(panel({ onPay: vi.fn() }))

    await user.click(screen.getByRole('button', { name: /Review booking policies/ }))

    const dialog = screen.getByRole('dialog', { name: 'Terms & Conditions' })
    expect(dialog).toHaveTextContent('You have read to the end.')
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: /Review booking policies/ })).toHaveTextContent('Read to the end')
    const agree = screen.getByRole('checkbox', { name: /I have read and agree to the booking policies/ })
    expect(agree).toBeEnabled()
    expect(agree).not.toBeChecked() // reading never ticks it
  })

  it('sends only one payment when Pay is clicked several times quickly (7.7)', async () => {
    let finish
    const onPay = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    render(panel({ onPay }))
    await readTermsAndAgree(userEvent.setup())
    const pay = screen.getByRole('button', { name: /Pay/ })

    fireEvent.click(pay)
    fireEvent.click(pay)
    fireEvent.click(pay)

    expect(onPay).toHaveBeenCalledTimes(1)
    expect(pay).toBeDisabled()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    await act(async () => finish())
  })

  it('shows what is paid now and what is left for each option, and the Pay button follows the choice', async () => {
    const user = userEvent.setup()
    const onOptionChange = vi.fn()
    const { rerender } = render(panel({ onPay: vi.fn(), onOptionChange }))

    expect(screen.getByRole('radio', { name: 'Booking deposit' }).closest('label')).toHaveTextContent('₱150.00')
    expect(screen.getByRole('radio', { name: 'Booking deposit' }).closest('label')).toHaveTextContent('Pay the rest (₱270.00) at the salon')
    expect(screen.getByRole('radio', { name: 'Full payment' }).closest('label')).toHaveTextContent('₱420.00')
    expect(screen.getByRole('button', { name: /Pay ₱150.00 deposit/ })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Full payment' }))
    expect(onOptionChange).toHaveBeenCalledWith('Full')
    rerender(panel({ onPay: vi.fn(), onOptionChange, option: 'Full' }))
    expect(screen.getByRole('button', { name: /Pay ₱420.00 in full/ })).toBeInTheDocument()
    // The deposit notice applies to a full payment too.
    expect(screen.getByRole('note')).toHaveTextContent('included in your full payment')
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
      .toEqual(['Leyah is not available', 'Schedule conflict', 'Emergency', 'Client did not respond', 'Others'])
  })
})

describe('Booking flow', () => {
  it('books with add-ons, updates the total live, pays and shows the receipt', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    // Step 1: service, colour and add-ons; the total updates as they change (Ref 10.4).
    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    const total = () => within(screen.getByRole('complementary')).getByText('Total').nextSibling.textContent
    expect(total()).toBe('₱400.00')
    // A new add-on goes on both hands, all 10 nails; one hand is 5, and the counter lowers it for an accent.
    await user.click(screen.getByRole('checkbox', { name: /French Tip/ }))
    expect(screen.getByRole('radio', { name: 'Both hands' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('10 nails')).toBeInTheDocument()
    expect(total()).toBe('₱550.00')
    await user.click(screen.getByRole('radio', { name: 'Right hand' }))
    expect(screen.getByText('5 nails')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fewer nails for French Tip' }))
    await user.click(screen.getByRole('button', { name: 'Fewer nails for French Tip' }))
    expect(screen.getByText('3 nails')).toBeInTheDocument()
    expect(total()).toBe('₱445.00')
    // A colour is required for a new set.
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    expect(screen.getByText('Choose a nail colour to continue.')).toBeInTheDocument()
    await pickShade(user, '06')
    expect(within(screen.getByRole('complementary')).getByText('#06 – Light Pink-Lavender')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Next:/ }))

    // Step 2: booked times, the 30-minute break after them and times where the 3-hour service doesn't fit
    // before the next appointment are disabled (Ref 10.1). Seeded booking #10: 1:00 PM, 60 minutes.
    pickDate(dateFromToday(5))
    expect(await screen.findByRole('button', { name: /^1:00.*Booked/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^2:00.*Break until 2:30 PM/ })).toBeDisabled() // the break, not a booking
    expect(screen.getByRole('button', { name: /^11:00.*Too close to the 1:00 PM appointment/ })).toBeDisabled() // would end 2:00 PM
    expect(screen.getByText('1:00 PM – 2:00 PM')).toBeInTheDocument() // "Taken:" shows the real appointment
    expect(screen.getByRole('button', { name: /^2:30 PM – 5:30 PM.*Available/ })).toBeEnabled()
    pickDate(dateFromToday(3))
    await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))

    // The note for Leyah sits under the date and time (Ref 2.4).
    // The note is typed; a quick-add suggestion adds a common phrase to it.
    await user.type(screen.getByLabelText(/Note for Leyah/), 'Short almond nails please')
    await user.click(screen.getByRole('button', { name: /I'll bring a reference photo/ }))
    expect(screen.getByLabelText(/Note for Leyah/)).toHaveValue("Short almond nails please. I'll bring a reference photo")
    await user.click(screen.getByRole('button', { name: /^Next:/ }))

    // Step 3: summary and payment.
    expect(screen.getByRole('heading', { name: 'Booking summary' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Booking policy' })).getByText(/reschedule online up to 24 hours before/)).toBeInTheDocument()
    expect(screen.getByText(/French Tip — Right hand/)).toBeInTheDocument()
    expect(screen.getByText('#06 – Light Pink-Lavender', { selector: '.review-color' , exact: false })).toBeInTheDocument()
    expect(screen.getByText("Short almond nails please. I'll bring a reference photo")).toBeInTheDocument()
    // Paying in full: the summary and the Pay button switch to the whole amount (₱400 + French Tip × 3 = ₱445).
    await user.click(screen.getByRole('radio', { name: 'Full payment' }))
    expect(screen.getByText('Full payment now').nextSibling).toHaveTextContent('₱445.00')
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    await readTermsAndAgree(user)
    await user.click(screen.getByRole('button', { name: /Pay ₱445.00 in full/ }))

    // Paid, but waiting for Leyah to confirm.
    expect(await screen.findByRole('heading', { name: 'Booking received!' })).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/Leyah will check it and confirm/)).toBeInTheDocument()
    const payment = getDb().payments.at(-1)
    expect(screen.getByText(payment.referenceNumber)).toBeInTheDocument()
    expect(payment).toMatchObject({ method: 'Maya', option: 'Full', amount: 445, balanceAfter: 0 })
    expect(getDb().bookings.at(-1)).toMatchObject({ bookingDate: dateFromToday(3), startTime: '11:00:00', durationMinutes: 180, status: 'Pending', amountPaid: 445, nailColor: '#06' })
    expect(getDb().bookings.at(-1).note).toBe("Short almond nails please. I'll bring a reference photo")
    expect(getDb().bookingAddOns.at(-1)).toMatchObject({ addOnId: 1, nailCount: 3, hand: 'Right' })
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
