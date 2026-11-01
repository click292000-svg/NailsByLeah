import { formatDate, formatDateTime, formatTime } from '../lib/format'
import { Money, StatusBadge } from './ui'

/** Payment receipt with the provider's reference number (Ref 12.5). */
export function Receipt({ receipt, booking }) {
  return (
    <div className="receipt" aria-label="Payment receipt">
      <div className="receipt-header">
        <span className="receipt-check" aria-hidden="true">✓</span>
        <div>
          <strong>Payment received</strong>
          <div className="muted">{formatDateTime(receipt.paidAt)}</div>
        </div>
      </div>
      <dl className="receipt-lines">
        <dt>Reference number</dt>
        <dd className="mono">{receipt.referenceNumber}</dd>
        <dt>Paid with</dt>
        <dd>{receipt.method}</dd>
        <dt>Deposit paid</dt>
        <dd><Money amount={receipt.amount} /></dd>
        <dt>Service</dt>
        <dd>{receipt.serviceName}</dd>
        <dt>Appointment</dt>
        <dd>{formatDate(receipt.bookingDate)}, {formatTime(receipt.startTime)}</dd>
        {booking && (
          <>
            <dt>Booking status</dt>
            <dd><StatusBadge status={booking.status} /></dd>
            <dt>Total</dt>
            <dd><Money amount={booking.totalPrice} /></dd>
            <dt>Balance due at the salon</dt>
            <dd><strong><Money amount={booking.balanceDue} /></strong></dd>
          </>
        )}
      </dl>
      <p className="muted small">The booking deposit is non-refundable. Booking #{receipt.bookingId}.</p>
    </div>
  )
}
