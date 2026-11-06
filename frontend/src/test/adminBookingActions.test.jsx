import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jsPDF } from 'jspdf'
import { ADMIN, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'
import { addDays, dateFromToday, today } from '../lib/dates'
import { buildSalesReportPdf, totalReceived } from '../lib/reportPdf'
import { BookingDetails } from '../pages/admin/BookingDetails'
import { StatusBadge } from '../components/ui'

const row = (name) => screen.getAllByRole('row').find((r) => within(r).queryByText(name))

/** Puts one seeded booking at a date and status, with a client name that appears nowhere else. */
function stage(overrides) {
  const db = getDb()
  const booking = db.bookings.find((b) => b.id === 8)
  const client = db.users.find((u) => u.id === booking.clientId)
  client.firstName = 'Testa'
  client.lastName = 'Client'
  db.bookings.filter((b) => b.id !== booking.id && b.bookingDate === (overrides.bookingDate ?? booking.bookingDate)).forEach((b) => { b.isDeleted = true })
  Object.assign(booking, overrides)
  saveDb()
  return booking
}

const openDashboard = async () => {
  await signIn(ADMIN)
  renderApp('/admin')
  await screen.findByRole('heading', { name: 'Dashboard' })
}

const menuFor = async (user, name) => {
  await user.click(within(await waitFor(() => row(name))).getByRole('button', { name: /More actions/ }))
}

describe('Completing a booking and its balance', () => {
  it('records the balance and reference when Leyah says it was paid', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: today(), startTime: '00:00:00', status: 'Confirmed' })
    await openDashboard()

    await user.click(within(await waitFor(() => row('Testa Client'))).getByRole('button', { name: 'Complete' }))
    const dialog = screen.getByRole('dialog', { name: 'Complete booking' })
    expect(within(dialog).getByRole('radio', { name: 'Balance received' })).toBeChecked()
    await user.type(within(dialog).getByLabelText(/GCash reference/), 'GC-555')
    await user.click(within(dialog).getByRole('button', { name: 'Complete booking' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as completed, balance received.`)).toBeInTheDocument()
    const saved = getDb().bookings.find((b) => b.id === booking.id)
    expect(saved.status).toBe('Completed')
    expect(saved.balanceReference).toBe('GC-555')
    expect(saved.balanceReceived).toBeGreaterThan(0)
  })

  it('can complete without the balance, then record it later from the menu', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: today(), startTime: '00:00:00', status: 'Confirmed' })
    await openDashboard()

    await user.click(within(await waitFor(() => row('Testa Client'))).getByRole('button', { name: 'Complete' }))
    const dialog = screen.getByRole('dialog', { name: 'Complete booking' })
    await user.click(within(dialog).getByRole('radio', { name: 'Not paid yet' }))
    expect(within(dialog).queryByLabelText(/GCash reference/)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Complete booking' }))
    expect(await screen.findByText(`Booking #${booking.id} marked as completed.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).balanceReceived ?? 0).toBe(0)

    await menuFor(user, 'Testa Client')
    await user.click(screen.getByRole('menuitem', { name: 'Record balance' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Record balance' })).getByRole('button', { name: 'Record balance' }))

    expect(await screen.findByText(`Balance recorded for booking #${booking.id}.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).balanceReceived).toBeGreaterThan(0)
  })

  it('completes straight away when nothing is left to pay', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: today(), startTime: '00:00:00', status: 'Confirmed', amountPaid: 5000, paymentOption: 'Full' })
    await openDashboard()

    await user.click(within(await waitFor(() => row('Testa Client'))).getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as completed.`)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('No-shows', () => {
  it('asks first, then marks a booking whose time has arrived', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: today(), startTime: '00:00:00', status: 'Confirmed' })
    await openDashboard()

    await menuFor(user, 'Testa Client')
    await user.click(screen.getByRole('menuitem', { name: 'Mark as no-show' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark as no-show' })
    expect(dialog).toHaveTextContent("deposit is kept. This can't be undone.")
    await user.click(within(dialog).getByRole('button', { name: 'Mark as no-show' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as a no-show.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).status).toBe('NoShow')
  })

  it('is not offered before the appointment time', async () => {
    const user = userEvent.setup()
    stage({ bookingDate: dateFromToday(2), startTime: '11:00:00', status: 'Confirmed' })
    await openDashboard()

    await menuFor(user, 'Testa Client')

    expect(screen.queryByRole('menuitem', { name: 'Mark as no-show' })).toBeNull()
  })

  it('reads as "No-show"', () => {
    render(<StatusBadge status="NoShow" />)
    expect(screen.getByText('No-show')).toHaveClass('badge-noshow')
  })
})

describe('Booking details', () => {
  const base = { id: 3, bookingDate: '2026-11-06', startTime: '11:00:00', endTime: '12:00:00', createdAt: '2026-11-04T15:45:00Z',
    client: { firstName: 'Kyla', lastName: 'Santos', username: 'kyla', email: 'k@example.test', phoneNumber: '09170000000' },
    serviceName: 'Plain', servicePrice: 300, totalPrice: 300, depositAmount: 150, addOns: [], referenceImages: [], note: null, cancellation: null }

  it('shows a balance paid after the service, with its reference', () => {
    render(<BookingDetails onClose={() => {}} booking={{ ...base, status: 'Completed', balanceDue: 0, payment: { amountPaid: 150, optionLabel: 'Booking deposit',
      balanceReceived: 150, balanceReceivedAt: '2026-11-06T05:00:00Z', balanceReference: 'GC-9' } }} />)

    expect(screen.getByText('GC-9')).toBeInTheDocument()
    expect(screen.getByText('Balance received')).toBeInTheDocument()
    expect(screen.getByText('Paid in full')).toBeInTheDocument()
  })

  it('does not ask for the balance of a no-show', () => {
    render(<BookingDetails onClose={() => {}} booking={{ ...base, status: 'NoShow', balanceDue: 150, payment: { amountPaid: 150, optionLabel: 'Booking deposit', balanceReceived: 0 } }} />)

    expect(screen.getByText('Not collected')).toBeInTheDocument()
    expect(screen.getByText('Not collected').closest('.bd-tile')).not.toHaveClass('bd-tile-due')
  })
})

describe('Dashboard: next 7 days', () => {
  it('lists upcoming bookings and warns about one that still needs confirming soon', async () => {
    stage({ bookingDate: addDays(today(), 1), startTime: '11:00:00', status: 'Pending' })
    await openDashboard()

    const card = screen.getByRole('heading', { name: 'Next 7 days' }).closest('.card')
    expect(within(card).getAllByText('Testa Client').length).toBeGreaterThan(0)
    expect(within(card).getByText(/in the next 2 days still needs? confirming/)).toBeInTheDocument()
  })
})

describe('Sales report PDF', () => {
  const report = { bookingsMade: 4, bookingsCompleted: 3, bookingsCancelled: 1, bookingsNoShow: 2, depositsCollected: 1200, balancesReceived: 450, balancesUnpaid: 150, completedServicesValue: 1800 }

  it('adds online payments and balances into the total received', () => {
    expect(totalReceived(report)).toBe(1650)
  })

  it('writes the figures, and the busy days of a month, with no client names', () => {
    const days = [{ ...report, date: '2026-11-03' }, { date: '2026-11-04', bookingsMade: 0, bookingsCompleted: 0, bookingsCancelled: 0, bookingsNoShow: 0, depositsCollected: 0, balancesReceived: 0 }]
    const text = buildSalesReportPdf(jsPDF, { period: 'November 2026', report: { ...report, days } }).output()

    expect(text).toContain('November 2026')
    expect(text).toContain('PHP 1,650.00') // total received
    expect(text).toContain('PHP 150.00') // unpaid balances
    expect(text).toContain('No-show')
    expect(text).toContain('Tue, Nov 3')
    expect(text).not.toContain('Wed, Nov 4') // nothing happened that day
    expect(text).toContain('not an official receipt')
  })

  it('fits a full month on one page', () => {
    const days = Array.from({ length: 31 }, (_, i) => ({ ...report, date: `2026-12-${String(i + 1).padStart(2, '0')}` }))
    expect(buildSalesReportPdf(jsPDF, { period: 'December 2026', report: { ...report, days } }).getNumberOfPages()).toBe(1)
  })

  it('makes a daily report without a table of days', () => {
    const text = buildSalesReportPdf(jsPDF, { period: 'Fri, Nov 6, 2026', report }).output()
    expect(text).not.toContain('Days with activity')
  })

  it('Reports offers the download once the figures have loaded', async () => {
    await signIn(ADMIN)
    renderApp('/admin/reports')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled())
  })
})
