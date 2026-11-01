import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate, formatTime } from '../../lib/format'
import { hoursUntil, startsAt } from '../../lib/dates'
import { Alert, Button, EmptyState, Money, PageHeader, PageLoader, Spinner, StatusBadge } from '../../components/ui'
import { CancelBookingDialog, RescheduleDialog } from '../../components/BookingDialogs'
import { Modal } from '../../components/Modal'
import { Receipt } from '../../components/Receipt'

const RESCHEDULE_HOURS = 24

const isActive = (b) => b.status === 'Pending' || b.status === 'Confirmed'
const isUpcoming = (b) => isActive(b) && startsAt(b.bookingDate, b.startTime) > new Date()

/** Booking history with statuses, reschedule and cancel (Ref 10.3, 10.6, 2.5). */
export default function MyBookingsPage() {
  const history = useAsync(() => Promise.all([api.bookings.history(), api.catalog.lookups()]), [])
  const [tab, setTab] = useState('upcoming')
  const [dialog, setDialog] = useState(null) // { kind, booking }
  const [message, setMessage] = useState(null)

  if (history.loading && !history.data) return <PageLoader label="Loading your bookings…" />
  if (history.error) return <Alert kind="error">{errorMessage(history.error)}</Alert>

  const [bookings, lookups] = history.data
  const upcoming = bookings.filter(isUpcoming).sort((a, b) => (a.bookingDate + a.startTime).localeCompare(b.bookingDate + b.startTime))
  const past = bookings.filter((b) => !isUpcoming(b))
  const shown = tab === 'upcoming' ? upcoming : past

  const done = (text) => {
    setDialog(null)
    setMessage(text)
    history.reload()
  }

  return (
    <div className="stack">
      <PageHeader title="My bookings" actions={<Link to="/book" className="btn btn-primary">Book again</Link>} />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'upcoming'} className={tab === 'upcoming' ? 'tab active' : 'tab'}
          onClick={() => setTab('upcoming')}>Upcoming ({upcoming.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'tab active' : 'tab'}
          onClick={() => setTab('past')}>Past &amp; cancelled ({past.length})</button>
        {history.loading && <Spinner small label="Refreshing" />}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={tab === 'upcoming' ? 'No upcoming appointments' : 'No past bookings yet'}>
          {tab === 'upcoming' && <Link to="/book">Book an appointment</Link>}
        </EmptyState>
      ) : (
        <ul className="booking-cards">
          {shown.map((b) => (
            <BookingCard key={b.id} booking={b} onAction={(kind) => setDialog({ kind, booking: b })} />
          ))}
        </ul>
      )}

      {dialog?.kind === 'cancel' && (
        <CancelBookingDialog booking={dialog.booking} reasons={lookups.clientCancellationReasons} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await api.bookings.cancel(dialog.booking.id, body)
            done('Your booking has been cancelled.')
          }} />
      )}
      {dialog?.kind === 'reschedule' && (
        <RescheduleDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            const moved = await api.bookings.reschedule(dialog.booking.id, body)
            done(`Rescheduled to ${formatDate(moved.bookingDate)} at ${formatTime(moved.startTime)}.`)
          }} />
      )}
      {dialog?.kind === 'receipt' && <ReceiptDialog booking={dialog.booking} onClose={() => setDialog(null)} />}
    </div>
  )
}

function BookingCard({ booking: b, onAction }) {
  const upcoming = isUpcoming(b)
  const canReschedule = upcoming && hoursUntil(b.bookingDate, b.startTime) >= RESCHEDULE_HOURS
  return (
    <li className="booking-card">
      <div className="booking-card-head">
        <div>
          <div className="booking-when">{formatDate(b.bookingDate)} · {formatTime(b.startTime)}</div>
          <div className="booking-what">{b.serviceName}</div>
        </div>
        <StatusBadge status={b.status} />
      </div>
      {b.addOns.length > 0 && (
        <p className="muted small">
          Add-ons: {b.addOns.map((a) => `${a.name} × ${a.nailCount}`).join(', ')}
        </p>
      )}
      <div className="booking-card-meta">
        <span>Total <Money amount={b.totalPrice} /></span>
        <span>Deposit <Money amount={b.depositAmount} /></span>
        <span>Note: {b.noteForLeahLabel}</span>
      </div>
      {b.cancellation && (
        <p className="muted small">
          Cancelled by {b.cancellation.cancelledByRole === 'Administrator' ? 'the salon' : 'you'}: {b.cancellation.reasonLabel}
          {b.cancellation.explanation && ` — ${b.cancellation.explanation}`}
        </p>
      )}
      <div className="booking-card-actions">
        <Button variant="ghost" size="sm" onClick={() => onAction('receipt')}>Receipt</Button>
        {upcoming && (
          <>
            <Button variant="secondary" size="sm" disabled={!canReschedule} onClick={() => onAction('reschedule')}>Reschedule</Button>
            <Button variant="danger-ghost" size="sm" onClick={() => onAction('cancel')}>Cancel</Button>
          </>
        )}
      </div>
      {upcoming && !canReschedule && (
        <p className="hint-text">Rescheduling is only possible at least 24 hours before your appointment.</p>
      )}
    </li>
  )
}

function ReceiptDialog({ booking, onClose }) {
  const receipt = useAsync(() => api.bookings.receipt(booking.id), [booking.id])
  return (
    <Modal title="Payment receipt" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      {receipt.loading && <PageLoader />}
      {receipt.error && <Alert kind="error">{errorMessage(receipt.error)}</Alert>}
      {receipt.data && <Receipt receipt={receipt.data} booking={booking} />}
    </Modal>
  )
}
