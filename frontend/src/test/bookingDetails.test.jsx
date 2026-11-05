import { render, screen, within } from '@testing-library/react'
import { BookingDetails } from '../pages/admin/BookingDetails'

const fullyPaid = {
  id: 3, status: 'Confirmed', bookingDate: '2026-11-06', startTime: '11:00:00', endTime: '12:30:00',
  client: { firstName: 'Kyla', lastName: 'Santos', username: 'kyla', email: 'kyla@example.test', phoneNumber: '09170000000' },
  serviceName: 'With Design', servicePrice: 400, totalPrice: 500, depositAmount: 150, balanceDue: 0,
  addOns: [{ addOnId: 2, name: 'Chrome', handLabel: 'Both hands', nailCount: 10, linePrice: 100 }],
  payment: { amountPaid: 500, optionLabel: 'Full payment', method: 'GCash', referenceNumber: 'GC-123', paidAt: '2026-11-04T15:45:00Z',
    verified: true, confirmedBy: 'Leyah Admin', confirmedAt: '2026-11-05T07:47:00Z' },
  note: null, referenceImages: [], createdAt: '2026-11-04T15:45:00Z', cancellation: null,
}

const section = (name) => screen.getByRole('heading', { name }).closest('section')
const show = (booking) => render(<BookingDetails booking={booking} onClose={() => {}} />)

describe('Booking details window', () => {
  it('shows the client with contact links, and the priced items adding up to the total', () => {
    show(fullyPaid)

    expect(within(section('Client')).getByRole('link', { name: 'kyla@example.test' })).toHaveAttribute('href', 'mailto:kyla@example.test')
    expect(within(section('Client')).getByRole('link', { name: '09170000000' })).toHaveAttribute('href', 'tel:09170000000')
    const service = within(section('Service'))
    expect(service.getByText('With Design')).toBeInTheDocument()
    expect(service.getByText('Both hands, 10 nails')).toBeInTheDocument()
    expect(service.getByText('₱500.00')).toBeInTheDocument()
  })

  it('makes a fully paid and verified booking clear', () => {
    show(fullyPaid)
    const payment = within(section('Payment'))

    expect(payment.getByText('Paid in full')).toBeInTheDocument()
    expect(payment.getByText('Full payment by GCash')).toBeInTheDocument()
    expect(payment.getByText(/Payment verified by Leyah Admin/)).toBeInTheDocument()
    expect(payment.getByText('GC-123')).toBeInTheDocument()
    expect(within(section('History')).getByText('Confirmed')).toBeInTheDocument()
  })

  it('shows what is still due and asks the admin to check a pending payment', () => {
    show({ ...fullyPaid, status: 'Pending', balanceDue: 350,
      payment: { ...fullyPaid.payment, amountPaid: 150, optionLabel: 'Booking deposit', verified: false, confirmedBy: null, confirmedAt: null } })
    const payment = within(section('Payment'))

    expect(payment.getByText('At the salon')).toBeInTheDocument()
    expect(payment.getByText('Waiting for you to verify and confirm')).toBeInTheDocument()
    expect(within(section('History')).queryByText('Confirmed')).toBeNull()
  })

  it('puts a cancellation and its reason near the top', () => {
    show({ ...fullyPaid, status: 'Cancelled',
      cancellation: { cancelledAt: '2026-11-05T08:00:00Z', cancelledByRole: 'Client', reasonLabel: 'Change of schedule', explanation: 'Moving away' } })

    expect(screen.getByText('Cancelled by the client: Change of schedule')).toBeInTheDocument()
    expect(screen.getByText('Moving away')).toBeInTheDocument()
  })

  it('still shows sensibly with no note, photos or payment record', () => {
    show({ ...fullyPaid, payment: null, balanceDue: 350 })

    expect(within(section('Note for Leyah')).getByText('No note')).toBeInTheDocument()
    expect(within(section('Design photos')).getByText('None uploaded')).toBeInTheDocument()
    expect(within(section('Payment')).getByText('Booking deposit')).toBeInTheDocument()
    expect(within(section('Payment')).getByText('Payment check not recorded')).toBeInTheDocument()
  })
})
