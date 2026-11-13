import { formatDate, formatDateTime, formatTime } from '../lib/format'
import { Money, StatusBadge } from './ui'

/**
 * Payment receipt with the provider's reference number (Ref 12.5): the service and add-ons, what was paid (deposit
 * or full payment) and what is left. A paid booking still waits for Leyah to confirm it.
 */
export function Receipt({ receipt, booking }) {
  const status = booking?.status ?? receipt.bookingStatus
  const total = booking?.totalPrice ?? receipt.totalAmount
  const balance = booking?.balanceDue ?? receipt.balanceDue
  // A cancelled or no-show booking owes no balance; what matters is the refund, if any.
  const closed = status === 'Cancelled' || status === 'NoShow'
  const refundDue = booking?.payment?.refundDue ?? receipt.refundDue ?? 0
  const refundSentAt = booking?.payment?.refundSentAt ?? receipt.refundSentAt
  const refundReference = booking?.payment?.refundReference ?? receipt.refundReference
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
        <dt>Booking number</dt>
        <dd>#{receipt.bookingId}</dd>
        <dt>Payment</dt>
        <dd>{receipt.paymentOptionLabel ?? 'Booking deposit'} via {receipt.method}</dd>
        <dt>Service</dt>
        <dd>
          {receipt.serviceName}
          {booking?.addOns.length > 0 && (
            <ul className="receipt-addons">
              {booking.addOns.map((a) => (
                <li key={a.addOnId}>+ {a.name} — {a.handLabel} × {a.nailCount} <Money amount={a.linePrice} /></li>
              ))}
            </ul>
          )}
        </dd>
        <dt>Appointment</dt>
        <dd>{formatDate(receipt.bookingDate)}, {formatTime(receipt.startTime)}</dd>
        <dt>Total</dt>
        <dd><Money amount={total} /></dd>
        <dt>Amount paid</dt>
        <dd><Money amount={receipt.amount} /></dd>
        {closed ? (
          <>
            <dt>Refund</dt>
            <dd>
              {refundDue > 0 ? (
                <>
                  <strong><Money amount={refundDue} /></strong>{' '}
                  <span className={refundSentAt ? 'refund-line sent' : 'refund-line'}>
                    {refundSentAt ? `sent ${formatDateTime(refundSentAt)}` : 'to be sent to the account you paid from'}
                  </span>
                  {refundReference && <div className="muted small">Reference <span className="mono">{refundReference}</span></div>}
                </>
              ) : 'None (the deposit is kept)'}
            </dd>
          </>
        ) : (
          <>
            <dt>Balance due at the salon</dt>
            <dd><strong><Money amount={balance} /></strong></dd>
          </>
        )}
        <dt>Booking status</dt>
        <dd><StatusBadge status={status} /></dd>
      </dl>
      {status === 'Pending' && (
        <p className="receipt-pending" role="note">Your payment is received. Leyah will check it and confirm your appointment; you&apos;ll get an email when she does.</p>
      )}
      <p className="receipt-note" role="note">The booking deposit is non-refundable unless the salon cancels.</p>
    </div>
  )
}
