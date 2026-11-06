import { formatDate, formatDateTime, formatTime } from '../../lib/format'
import { Button, Money, StatusBadge } from '../../components/ui'
import { Modal } from '../../components/Modal'
import { ReferenceImageGallery } from '../../components/ReferenceImageGallery'

function Section({ title, children, wide = false }) {
  return (
    <section className={wide ? 'bd-section bd-wide' : 'bd-section'}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

/** A label on the left, its value on the right; for price lines and short facts. */
const Row = ({ label, children, strong = false }) => (
  <div className={strong ? 'bd-row bd-row-strong' : 'bd-row'}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
)

/** Has the money been checked? Leyah looks here before confirming a booking. */
function PaymentCheck({ booking: b }) {
  if (b.payment?.verified) {
    const by = b.payment.confirmedBy ? ` by ${b.payment.confirmedBy}` : ''
    return <p className="bd-check bd-check-ok">✓ Payment verified{by}</p>
  }
  if (b.status === 'Pending') return <p className="bd-check bd-check-waiting">Waiting for you to verify and confirm</p>
  return <p className="bd-check">Payment check not recorded</p>
}

/** One booking at a glance: when it is, who it's for, what they're having, what's been paid, and what happened so far. */
export function BookingDetails({ booking: b, onClose }) {
  const client = b.client
  const paid = b.payment?.amountPaid ?? b.depositAmount
  const paidInFull = b.balanceDue === 0
  const closed = b.status === 'Cancelled' || b.status === 'NoShow'
  const balanceReceived = b.payment?.balanceReceived > 0

  return (
    <Modal wide title={`Booking #${b.id}`} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="bd">
        <header className="bd-hero">
          <div>
            <p className="bd-date">{formatDate(b.bookingDate)}</p>
            <p className="bd-time">{formatTime(b.startTime)} – {formatTime(b.endTime)}</p>
          </div>
          <StatusBadge status={b.status} />
        </header>

        {b.cancellation && (
          <div className="bd-cancelled">
            <strong>Cancelled by {b.cancellation.cancelledByRole === 'Administrator' ? 'the salon' : 'the client'}: {b.cancellation.reasonLabel}</strong>
            {b.cancellation.explanation && <p>{b.cancellation.explanation}</p>}
          </div>
        )}

        <div className="bd-grid">
          <Section title="Client">
            <p className="bd-name">{client?.firstName} {client?.lastName}</p>
            <p className="muted small">@{client?.username}</p>
            <ul className="bd-contact">
              <li><a href={`mailto:${client?.email}`}>{client?.email}</a></li>
              <li><a href={`tel:${client?.phoneNumber}`}>{client?.phoneNumber}</a></li>
            </ul>
          </Section>

          <Section title="Service">
            <dl className="bd-rows">
              <Row label={b.serviceName}><Money amount={b.servicePrice} /></Row>
              {b.addOns.map((a) => (
                <Row key={a.addOnId} label={<>{a.name}<span className="bd-sub">{a.handLabel}, {a.nailCount} {a.nailCount === 1 ? 'nail' : 'nails'}</span></>}>
                  <Money amount={a.linePrice} />
                </Row>
              ))}
              <Row label="Total" strong><Money amount={b.totalPrice} /></Row>
            </dl>
          </Section>

          <Section title="Payment" wide>
            <div className="bd-payment">
              <div className="bd-tiles">
                <div className="bd-tile">
                  <span>Paid</span>
                  <strong><Money amount={paid} /></strong>
                  <small>{b.payment?.method ? `${b.payment.optionLabel ?? 'Booking deposit'} by ${b.payment.method}` : b.payment?.optionLabel ?? 'Booking deposit'}</small>
                </div>
                <div className={!closed && !paidInFull ? 'bd-tile bd-tile-due' : 'bd-tile'}>
                  <span>Balance due</span>
                  <strong><Money amount={b.balanceDue} /></strong>
                  <small>{closed && !paidInFull ? 'Not collected' : paidInFull ? 'Paid in full' : b.status === 'Completed' ? 'Not recorded yet' : 'At the salon'}</small>
                </div>
              </div>
              <PaymentCheck booking={b} />
              {b.payment?.referenceNumber && <p className="bd-reference">Reference <span className="mono">{b.payment.referenceNumber}</span></p>}
              {balanceReceived && (
                <p className="bd-reference">
                  Balance of <Money amount={b.payment.balanceReceived} /> received
                  {b.payment.balanceReference && <>, reference <span className="mono">{b.payment.balanceReference}</span></>}
                </p>
              )}
              <p className="muted small">The <Money amount={b.depositAmount} /> deposit is non-refundable.</p>
            </div>
          </Section>

          <Section title="Note for Leyah">
            {b.note ? <p className="summary-note">{b.note}</p> : <p className="muted">No note</p>}
          </Section>

          <Section title="Design photos">
            {b.referenceImages?.length ? <ReferenceImageGallery images={b.referenceImages} /> : <p className="muted">None uploaded</p>}
          </Section>

          <Section title="History" wide>
            <ol className="bd-history">
              <li><span>Booked</span><time>{formatDateTime(b.createdAt)}</time></li>
              {b.payment?.paidAt && <li><span>Paid</span><time>{formatDateTime(b.payment.paidAt)}</time></li>}
              {b.payment?.confirmedAt && <li><span>Confirmed</span><time>{formatDateTime(b.payment.confirmedAt)}</time></li>}
              {balanceReceived && <li><span>Balance received</span><time>{formatDateTime(b.payment.balanceReceivedAt)}</time></li>}
              {b.cancellation && <li><span>Cancelled</span><time>{formatDateTime(b.cancellation.cancelledAt)}</time></li>}
            </ol>
          </Section>
        </div>
      </div>
    </Modal>
  )
}
