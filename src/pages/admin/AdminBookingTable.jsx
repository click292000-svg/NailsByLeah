import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate, formatDateTime, formatTime } from '../../lib/format'
import { today } from '../../lib/dates'
import { Alert, Button, EmptyState, Money, StatusBadge } from '../../components/ui'
import { CancelBookingDialog, RescheduleDialog } from '../../components/BookingDialogs'
import { Modal } from '../../components/Modal'

const isActive = (b) => b.status === 'Pending' || b.status === 'Confirmed'

/**
 * Bookings table with the administrator actions Confirm, Reschedule, Complete and Cancel (Ref 11.2).
 * On small screens each row becomes a card (cells carry data-label).
 */
export function AdminBookingTable({ bookings, onChanged }) {
  const lookups = useAsync(() => api.catalog.lookups(), [])
  const [dialog, setDialog] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const quick = async (booking, action, message) => {
    setBusyId(booking.id)
    setError(null)
    try {
      await api.admin[action](booking.id)
      onChanged(message)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const closeAnd = (message) => {
    setDialog(null)
    onChanged(message)
  }

  if (bookings.length === 0) return <EmptyState title="No bookings found" />

  return (
    <>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date &amp; time</th>
              <th>Client</th>
              <th>Service</th>
              <th>Total</th>
              <th>Status</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td data-label="When">{formatDate(b.bookingDate)}<br /><span className="muted">{formatTime(b.startTime)}</span></td>
                <td data-label="Client">{b.client?.firstName} {b.client?.lastName}<br /><span className="muted small">@{b.client?.username}</span></td>
                <td data-label="Service">
                  {b.serviceName}
                  {b.addOns.length > 0 && <div className="muted small">+ {b.addOns.map((a) => `${a.name} ×${a.nailCount}`).join(', ')}</div>}
                </td>
                <td data-label="Total"><Money amount={b.totalPrice} /></td>
                <td data-label="Status">
                  <StatusBadge status={b.status} />
                  {b.cancellation && <div className="muted small">{b.cancellation.reasonLabel}</div>}
                </td>
                <td className="actions-cell">
                  <div className="row-actions">
                    <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'details', booking: b })}>Details</Button>
                    {b.status === 'Pending' && (
                      <Button size="sm" loading={busyId === b.id} onClick={() => quick(b, 'confirm', `Booking #${b.id} confirmed.`)}>Confirm</Button>
                    )}
                    {b.status === 'Confirmed' && b.bookingDate <= today() && (
                      <Button size="sm" loading={busyId === b.id} onClick={() => quick(b, 'complete', `Booking #${b.id} marked as completed.`)}>Complete</Button>
                    )}
                    {isActive(b) && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'reschedule', booking: b })}>Reschedule</Button>
                        <Button variant="danger-ghost" size="sm" onClick={() => setDialog({ kind: 'cancel', booking: b })}>Cancel</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'cancel' && lookups.data && (
        <CancelBookingDialog booking={dialog.booking} reasons={lookups.data.adminCancellationReasons} allowExplanation
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await api.admin.cancel(dialog.booking.id, body)
            closeAnd(`Booking #${dialog.booking.id} cancelled.`)
          }} />
      )}
      {dialog?.kind === 'reschedule' && (
        <RescheduleDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            const moved = await api.admin.reschedule(dialog.booking.id, body)
            closeAnd(`Booking #${moved.id} moved to ${formatDate(moved.bookingDate)} at ${formatTime(moved.startTime)}.`)
          }} />
      )}
      {dialog?.kind === 'details' && <BookingDetails booking={dialog.booking} onClose={() => setDialog(null)} />}
    </>
  )
}

function BookingDetails({ booking: b, onClose }) {
  return (
    <Modal title={`Booking #${b.id}`} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <dl className="detail-list">
        <dt>Status</dt><dd><StatusBadge status={b.status} /></dd>
        <dt>Appointment</dt><dd>{formatDate(b.bookingDate)}, {formatTime(b.startTime)} – {formatTime(b.endTime)}</dd>
        <dt>Client</dt><dd>{b.client?.firstName} {b.client?.lastName} (@{b.client?.username})</dd>
        <dt>Contact</dt><dd>{b.client?.email} · {b.client?.phoneNumber}</dd>
        <dt>Service</dt><dd>{b.serviceName} — <Money amount={b.servicePrice} /></dd>
        {b.addOns.map((a) => (
          <div key={a.addOnId} className="detail-pair">
            <dt>Add-on</dt><dd>{a.name} × {a.nailCount} — <Money amount={a.linePrice} /></dd>
          </div>
        ))}
        <dt>Total</dt><dd><Money amount={b.totalPrice} /></dd>
        <dt>Deposit</dt><dd><Money amount={b.depositAmount} /> (non-refundable)</dd>
        <dt>Balance due</dt><dd><Money amount={b.balanceDue} /></dd>
        <dt>Note for Leah</dt><dd>{b.noteForLeahLabel}</dd>
        <dt>Booked on</dt><dd>{formatDateTime(b.createdAt)}</dd>
        {b.cancellation && (
          <>
            <dt>Cancelled</dt>
            <dd>{formatDateTime(b.cancellation.cancelledAt)} by {b.cancellation.cancelledByRole === 'Administrator' ? 'the salon' : 'the client'}</dd>
            <dt>Reason</dt><dd>{b.cancellation.reasonLabel}</dd>
            <dt>Explanation</dt><dd>{b.cancellation.explanation ?? <span className="muted">None given</span>}</dd>
          </>
        )}
      </dl>
    </Modal>
  )
}
