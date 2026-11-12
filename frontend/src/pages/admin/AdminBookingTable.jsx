import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { bookingClientHandle, bookingClientName } from '../../lib/bookingClient'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate, formatTime } from '../../lib/format'
import { startsAt, today } from '../../lib/dates'
import { Alert, Button, EmptyState, Money, STATUS_LABELS } from '../../components/ui'
import { BalanceDialog, CancelBookingDialog, NoShowDialog, RefundDialog, RescheduleDialog } from '../../components/BookingDialogs'
import { refundOwed } from '../../lib/refunds'
import { BookingDetails } from './BookingDetails'

const isActive = (b) => b.status === 'Pending' || b.status === 'Confirmed'
const hasStarted = (b) => startsAt(b.bookingDate, b.startTime) <= new Date()
// A cancelled booking or a no-show owes nothing more, so no balance is shown for them.
const isClosed = (b) => b.status === 'Cancelled' || b.status === 'NoShow'

/** Booking status as a small coloured dot and its name, kept apart from the payment pill. */
export const StatusDot = ({ status }) => (
  <span className={`status-dot status-dot-${String(status).toLowerCase()}`}>{STATUS_LABELS[status] ?? status}</span>
)

/**
 * Bookings table with the administrator actions Confirm, Complete, Record balance, No-show, Reschedule and Cancel (Ref 11.2).
 * On small screens each row becomes a card (cells carry data-label).
 */
export function AdminBookingTable({ bookings, onChanged, emptyTitle = 'No bookings found', emptyText, dayView = false, serviceName = (b) => b.serviceName }) {
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

  if (bookings.length === 0) return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>

  return (
    <>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <div className="table-wrap">
        <table className="data-table bookings-table">
          <thead>
            <tr>
              <th>{dayView ? 'Time' : 'Date & time'}</th>
              <th>Client</th>
              <th>Service</th>
              <th>Payment</th>
              <th>Status</th>
              <th className="actions-head">Action</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const day = new Date(`${b.bookingDate}T00:00:00`)
              const fullyPaid = b.payment?.option === 'Full' || b.balanceDue === 0
              return (
                <tr key={b.id} className={`booking-row booking-row-${b.status.toLowerCase()}`}>
                  <td data-label={dayView ? 'Time' : 'When'}>
                    {dayView ? (
                      <span className="time-pill">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        <span>{formatTime(b.startTime)} –</span> <span>{formatTime(b.endTime)}</span>
                      </span>
                    ) : (
                      <div className="when-cell">
                        <span className="mini-date" aria-hidden="true">
                          <small>{day.toLocaleDateString('en-PH', { month: 'short' })}</small>
                          <b>{day.getDate()}</b>
                        </span>
                        <span>
                          <span className="when-day">{day.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          <span className="muted small">{formatTime(b.startTime)} – {formatTime(b.endTime)}</span>
                        </span>
                      </div>
                    )}
                  </td>
                  <td data-label="Client">
                    <span className="cell-main">{bookingClientName(b)}</span>
                    <span className="muted small">{bookingClientHandle(b)}</span>
                  </td>
                  <td data-label="Service">
                    <span className="cell-main">{serviceName(b)}</span>
                    {b.removalServiceName && <span className="muted small">+ Removal ({b.removalServiceName}) first</span>}
                    {b.colorRequestStatus === 'Pending' && <span className="color-request-badge">Colour request</span>}
                    {b.addOns.length > 0 && <span className="muted small">+ {b.addOns.map((a) => `${a.name} (${a.handLabel.toLowerCase()} ×${a.nailCount})`).join(', ')}</span>}
                    {b.referenceImages?.length > 0 && (
                      <span className="muted small">📎 {b.referenceImages.length} design {b.referenceImages.length === 1 ? 'photo' : 'photos'}</span>
                    )}
                  </td>
                  <td data-label="Payment">
                    <span className="cell-main"><Money amount={b.totalPrice} /></span>
                    {!isClosed(b) && (
                      <span className={fullyPaid ? 'pay-pill paid' : 'pay-pill due'}>
                        {fullyPaid ? '✓ Paid' : <><Money amount={b.balanceDue} /> due</>}
                      </span>
                    )}
                  </td>
                  <td data-label="Status">
                    <StatusDot status={b.status} />
                    {b.cancellation && <span className="muted small status-note">{b.cancellation.reasonLabel}</span>}
                  </td>
                  <td className="actions-cell">
                    {/* One main action per row; everything else is in the More menu. */}
                    <div className="row-actions">
                      {b.status === 'Pending' && (
                        <Button size="sm" loading={busyId === b.id} onClick={() => quick(b, 'confirm', `Booking #${b.id} confirmed.`)}>Confirm</Button>
                      )}
                      {b.status === 'Confirmed' && b.bookingDate <= today() && (
                        <Button size="sm" loading={busyId === b.id}
                          onClick={() => (b.balanceDue > 0 ? setDialog({ kind: 'complete', booking: b }) : quick(b, 'complete', `Booking #${b.id} marked as completed.`))}>
                          Complete
                        </Button>
                      )}
                      <RowMenu label={`More actions for booking #${b.id}`} items={[
                        { label: 'View details', onSelect: () => setDialog({ kind: 'details', booking: b }) },
                        b.status === 'Completed' && b.balanceDue > 0 && { label: 'Record balance', onSelect: () => setDialog({ kind: 'balance', booking: b }) },
                        refundOwed(b) && { label: 'Record refund sent', onSelect: () => setDialog({ kind: 'refund', booking: b }) },
                        isActive(b) && { label: 'Reschedule', onSelect: () => setDialog({ kind: 'reschedule', booking: b }) },
                        isActive(b) && hasStarted(b) && { label: 'Mark as no-show', danger: true, onSelect: () => setDialog({ kind: 'no-show', booking: b }) },
                        isActive(b) && { label: 'Cancel booking', danger: true, onSelect: () => setDialog({ kind: 'cancel', booking: b }) },
                      ].filter(Boolean)} />
                    </div>
                  </td>
                </tr>
              )
            })}
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
      {dialog?.kind === 'details' && <BookingDetails booking={dialog.booking} onClose={() => setDialog(null)} onChanged={() => onChanged?.(null)} />}
      {dialog?.kind === 'complete' && (
        <BalanceDialog booking={dialog.booking} completing onClose={() => setDialog(null)}
          onSubmit={async ({ received, reference }) => {
            await api.admin.complete(dialog.booking.id, { balanceReceived: received, balanceReference: received ? reference : null })
            closeAnd(`Booking #${dialog.booking.id} marked as completed${received ? ', balance received' : ''}.`)
          }} />
      )}
      {dialog?.kind === 'balance' && (
        <BalanceDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async ({ reference }) => {
            await api.admin.recordBalance(dialog.booking.id, { balanceReference: reference })
            closeAnd(`Balance recorded for booking #${dialog.booking.id}.`)
          }} />
      )}
      {dialog?.kind === 'refund' && (
        <RefundDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await api.admin.recordRefund(dialog.booking.id, body)
            closeAnd(`Refund recorded for booking #${dialog.booking.id}.`)
          }} />
      )}
      {dialog?.kind === 'no-show' && (
        <NoShowDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async () => {
            await api.admin.markNoShow(dialog.booking.id)
            closeAnd(`Booking #${dialog.booking.id} marked as a no-show.`)
          }} />
      )}
    </>
  )
}

/**
 * "⋯" button with a small menu of row actions. The menu is fixed to the viewport so the scrolling table can't clip it;
 * it closes on Escape, a click elsewhere or scrolling, and arrow keys move between items.
 */
function RowMenu({ label, items }) {
  const [position, setPosition] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const open = position !== null

  useEffect(() => {
    if (!open) return undefined
    menuRef.current?.querySelector('button')?.focus()
    const close = (e) => { if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setPosition(null) }
    const shut = () => setPosition(null)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', shut, true)
    window.addEventListener('resize', shut)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', shut, true)
      window.removeEventListener('resize', shut)
    }
  }, [open])

  const toggle = () => {
    if (open) return setPosition(null)
    const r = buttonRef.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom > 160
    setPosition({ right: Math.max(8, window.innerWidth - r.right), ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) })
  }

  const onKeyDown = (e) => {
    const buttons = [...menuRef.current.querySelectorAll('button')]
    const i = buttons.indexOf(document.activeElement)
    if (e.key === 'Escape') { setPosition(null); buttonRef.current.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus() }
  }

  return (
    <>
      <button ref={buttonRef} type="button" className="row-menu-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <div ref={menuRef} className="row-menu" role="menu" style={position} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={item.danger ? 'danger' : undefined}
              onClick={() => { setPosition(null); item.onSelect() }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
