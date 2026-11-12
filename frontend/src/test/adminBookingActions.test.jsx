import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'
import { addDays, dateFromToday, today } from '../lib/dates'
import ExcelJS from 'exceljs'
import { buildSalesReportWorkbook, totalReceived } from '../lib/reportExcel'
import { BookingDetails } from '../pages/admin/BookingDetails'
import { StatusBadge } from '../components/ui'
import { CancelBookingDialog } from '../components/BookingDialogs'

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

/** The dashboard's "Needs your attention" row for a booking. */
const attentionRow = (bookingId) => waitFor(() => {
  const card = screen.getByRole('heading', { name: 'Needs your attention' }).closest('.card')
  const item = within(card).getAllByRole('listitem').find((li) => within(li).queryByRole('button', { name: new RegExp(`booking #${bookingId}\\.`) }))
  expect(item).toBeTruthy()
  return item
})

describe('Completing a booking and its balance', () => {
  it('records the balance and reference when Leyah says it was paid', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed' })
    await openDashboard()

    const item = await attentionRow(booking.id)
    expect(item).toHaveTextContent('Did they come?')
    expect(item).toHaveTextContent('date passed, still confirmed')
    await user.click(within(item).getByRole('button', { name: 'Complete' }))
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

  it('can complete without the balance, then record it later from Needs your attention', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed' })
    // Only this booking owes money, so its row is among the first five shown.
    getDb().bookings.forEach((b) => { if (b.status === 'Completed') b.isDeleted = true })
    saveDb()
    await openDashboard()

    await user.click(within(await attentionRow(booking.id)).getByRole('button', { name: 'Complete' }))
    const dialog = screen.getByRole('dialog', { name: 'Complete booking' })
    await user.click(within(dialog).getByRole('radio', { name: 'Not paid yet' }))
    expect(within(dialog).queryByLabelText(/GCash reference/)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Complete booking' }))
    expect(await screen.findByText(`Booking #${booking.id} marked as completed.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).balanceReceived ?? 0).toBe(0)

    const owing = await attentionRow(booking.id)
    expect(owing).toHaveTextContent('Balance not recorded · Testa Client')
    await user.click(within(owing).getByRole('button', { name: 'Record' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Record balance' })).getByRole('button', { name: 'Record balance' }))

    expect(await screen.findByText(`Balance recorded for booking #${booking.id}.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).balanceReceived).toBeGreaterThan(0)
  })

  it('completes straight away when nothing is left to pay', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed', amountPaid: 5000, paymentOption: 'Full' })
    await openDashboard()

    await user.click(within(await attentionRow(booking.id)).getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as completed.`)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('No-shows', () => {
  it('asks first, then marks a booking whose time has arrived', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), -1), startTime: '11:00:00', status: 'Confirmed' })
    await openDashboard()

    await user.click(within(await attentionRow(booking.id)).getByRole('button', { name: 'No-show' }))
    const dialog = screen.getByRole('dialog', { name: 'Mark as no-show' })
    expect(dialog).toHaveTextContent("deposit is kept as the no-show fee. This can't be undone.")
    await user.click(within(dialog).getByRole('button', { name: 'Mark as no-show' }))

    expect(await screen.findByText(`Booking #${booking.id} marked as a no-show.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).status).toBe('NoShow')
  })

  it('is not offered before the appointment time', async () => {
    const user = userEvent.setup()
    stage({ bookingDate: dateFromToday(2), startTime: '11:00:00', status: 'Confirmed' })
    await signIn(ADMIN)
    renderApp('/admin/bookings')

    await screen.findByRole('heading', { name: 'Find bookings' })
    await menuFor(user, 'Testa Client')

    expect(screen.queryByRole('menuitem', { name: 'Mark as no-show' })).toBeNull()
  })

  it('reads as "No-show"', () => {
    render(<StatusBadge status="NoShow" />)
    expect(screen.getByText('No-show')).toHaveClass('badge-noshow')
  })
})

describe('Refunds', () => {
  const paidInFull = { id: 5, serviceName: 'Plain', bookingDate: '2026-11-20', startTime: '11:00:00', depositAmount: 150,
    payment: { amountPaid: 300 }, client: { firstName: 'Kyla', lastName: 'Santos' } }
  const reasons = [{ value: 'StaffUnavailable', label: 'Leyah is not available' }, { value: 'ClientDidNotRespond', label: 'Client did not respond' }]

  it('tells a client who paid in full what comes back when cancelling', () => {
    render(<CancelBookingDialog booking={paidInFull} reasons={[]} onSubmit={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('You paid ₱300.00. The ₱150.00 deposit is non-refundable, so ₱150.00 will be refunded')
  })

  it('tells a client who paid only the deposit that nothing comes back', () => {
    render(<CancelBookingDialog booking={{ ...paidInFull, payment: { amountPaid: 150 } }} reasons={[]} onSubmit={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('non-refundable, so nothing is refunded')
  })

  it('tells Leyah the whole payment goes back when the salon cancels, but not when the client stopped answering', async () => {
    const user = userEvent.setup()
    render(<CancelBookingDialog booking={paidInFull} reasons={reasons} allowExplanation onSubmit={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('everything they paid: ₱300.00, the deposit included')
    await user.selectOptions(screen.getByLabelText(/Reason for cancelling/), 'ClientDidNotRespond')
    expect(screen.getByRole('dialog')).toHaveTextContent('the ₱150.00 deposit is kept, and ₱150.00 is refunded')
  })

  it('lists a refund to send on the dashboard until Leyah records it', async () => {
    const user = userEvent.setup()
    // Leyah cancelled this paid-in-full booking because she was sick, so all ₱300 goes back.
    const booking = stage({ bookingDate: addDays(today(), 4), startTime: '11:00:00', status: 'Cancelled', amountPaid: 300, paymentOption: 'Full', refundDue: 300 })
    await openDashboard()
    const item = await attentionRow(booking.id)
    expect(item).toHaveTextContent('Refund to send · Testa Client')
    await user.click(within(item).getByRole('button', { name: 'Record' }))
    const dialog = screen.getByRole('dialog', { name: 'Record refund' })
    await user.type(within(dialog).getByLabelText(/reference/), 'GC-RF-9')
    await user.click(within(dialog).getByRole('button', { name: 'Record refund sent' }))

    expect(await screen.findByText(`Refund recorded for booking #${booking.id}.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id)).toMatchObject({ refundReference: 'GC-RF-9' })
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

describe('Dashboard', () => {
  it('lists upcoming bookings and asks Leyah to check a payment, then confirms it', async () => {
    const user = userEvent.setup()
    const booking = stage({ bookingDate: addDays(today(), 1), startTime: '11:00:00', status: 'Pending' })
    await openDashboard()

    const week = screen.getByRole('heading', { name: 'Next 7 days' }).closest('.card')
    const line = within(week).getByRole('button', { name: /Testa Client, Pending/ })
    expect(line).toHaveTextContent('Testa Client · ')

    const item = await attentionRow(booking.id)
    expect(item).toHaveTextContent('Check payment · Testa Client')
    await user.click(within(item).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText(`Booking #${booking.id} confirmed.`)).toBeInTheDocument()
    expect(getDb().bookings.find((b) => b.id === booking.id).status).toBe('Confirmed')
  })

  it('shows the next client with the colour, Stones and note, and another day from the date stepper', async () => {
    const user = userEvent.setup()
    const day = addDays(today(), 3)
    stage({ bookingDate: day, startTime: '11:00:00', status: 'Confirmed', nailColor: '#06', note: 'Short almond' })
    await openDashboard()

    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Next day' }))
    const card = (await screen.findByRole('heading', { name: /First client/ })).closest('.card')

    expect(card).toHaveTextContent('11:00 AM')
    expect(card).toHaveTextContent('Testa Client')
    expect(card).toHaveTextContent('#06')
    expect(card).toHaveTextContent('Short almond')
    expect(within(card).getByText(/in \d+ days?/)).toBeInTheDocument()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(await screen.findByRole('heading', { name: 'Next client' })).toBeInTheDocument()
  })

  it('says all caught up when nothing needs Leyah', async () => {
    const db = getDb()
    db.bookings.forEach((b) => { if (b.status === 'Pending' || b.status === 'Completed' || b.bookingDate <= today()) b.isDeleted = true })
    saveDb()
    await openDashboard()

    expect(await screen.findByText('All caught up')).toBeInTheDocument()
  })

  it("shows the day's schedule beside the next 7 days, and the balance still to collect", async () => {
    stage({ bookingDate: today(), startTime: '23:00:00', status: 'Confirmed' })
    getDb().bookings.forEach((b) => { if (b.status === 'Pending' || b.status === 'Completed' || (b.bookingDate < today())) b.isDeleted = true })
    saveDb()
    await openDashboard()

    const day = (await screen.findByRole('heading', { name: 'Today’s schedule' })).closest('.card')
    expect(within(day).getByRole('button', { name: /11:00 PM to .*Testa Client, Confirmed/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Next 7 days' })).toBeInTheDocument()
    expect(screen.getByText(/Balance to collect/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Busy day' })).toBeNull()
    expect(screen.queryByText('Moved to other pages')).toBeNull()
  })
})

describe('Sales report Excel file', () => {
  const report = { bookingsMade: 4, bookingsCompleted: 3, bookingsCancelled: 1, bookingsNoShow: 2, depositsCollected: 1200, balancesReceived: 450, balancesUnpaid: 150, completedServicesValue: 1800 }
  // The value beside a label in the Summary sheet's first column of figures.
  const valueOf = (sheet, label) => {
    let found
    sheet.eachRow((row) => {
      const cell = row.getCell(2).value
      const text = typeof cell === 'object' && cell?.richText ? cell.richText[0].text : cell
      if (text === label && found === undefined) found = row.getCell(3).value
    })
    return found
  }

  it('adds online payments and balances into the total received', () => {
    expect(totalReceived(report)).toBe(1650)
  })

  it('writes the figures, peso formatted, and the busy days of a month with a totals row', async () => {
    const days = [{ ...report, date: '2026-11-03' }, { date: '2026-11-04', bookingsMade: 0, bookingsCompleted: 0, bookingsCancelled: 0, bookingsNoShow: 0, depositsCollected: 0, balancesReceived: 0 }]
    const book = buildSalesReportWorkbook(ExcelJS, { period: 'November 2026', report: { ...report, days } })

    const summary = book.getWorksheet('Summary')
    expect(summary.getCell('B3').value).toBe('Sales report · November 2026')
    expect(valueOf(summary, 'Total received')).toBe(1650)
    expect(valueOf(summary, 'Balances unpaid')).toBe(150)
    expect(valueOf(summary, 'No-show')).toBe(2)

    const daySheet = book.getWorksheet('Days')
    expect(daySheet.getCell('A4').value).toBe('Tue, Nov 3') // Nov 4 had nothing, so it's left out
    expect(daySheet.getCell('A5').value).toBe('Total')
    expect(daySheet.getCell('F5').value).toMatchObject({ formula: 'SUM(F4:F4)', result: 1200 })
    expect(daySheet.getCell('F4').numFmt).toContain('₱')

    // The file is a real workbook: it opens again with the same figures.
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(await book.xlsx.writeBuffer())
    expect(valueOf(reopened.getWorksheet('Summary'), 'Total received')).toBe(1650)
  })

  it('makes a daily report without a sheet of days', () => {
    const book = buildSalesReportWorkbook(ExcelJS, { period: 'Fri, Nov 6, 2026', report })
    expect(book.worksheets.map((w) => w.name)).toEqual(['Summary'])
  })

  it('Reports offers the download once the figures have loaded', async () => {
    await signIn(ADMIN)
    renderApp('/admin/reports')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download Excel' })).toBeEnabled())
  })
})
