import { useState } from 'react'
import { formatDate, formatDateTime, formatTime } from '../../lib/format'
import { errorMessage } from '../../api/errors'
import { Button, Money, StatusBadge } from '../../components/ui'
import { Modal } from '../../components/Modal'
import { ReceiptDownload } from '../../components/ReceiptDownload'
import { api } from '../../api'
import { colorFor, colorLabel, colorRequestLabel, perNailText } from '../../lib/shades'
import { apiPhotoSrc } from '../../lib/photos'
import { bookingClientHandle, bookingClientName, bookingClientPhone, isWalkIn } from '../../lib/bookingClient'
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
export function BookingDetails({ booking, onClose, onChanged }) {
  // Kept here so answering a colour request shows straight away; the page behind reloads through onChanged.
  const [b, setBooking] = useState(booking)
  const [deciding, setDeciding] = useState(null)
  const [decideError, setDecideError] = useState(null)
  const decide = async (available) => {
    setDeciding(available ? 'yes' : 'no')
    setDecideError(null)
    try {
      setBooking(await api.admin.decideColorRequest(b.id, available))
      onChanged?.()
    } catch (err) {
      setDecideError(errorMessage(err))
    } finally {
      setDeciding(null)
    }
  }
  const client = b.client
  const walkIn = isWalkIn(b)
  const paid = b.payment?.amountPaid ?? b.depositAmount
  const paidInFull = b.balanceDue === 0
  const closed = b.status === 'Cancelled' || b.status === 'NoShow'
  const balanceReceived = b.payment?.balanceReceived > 0

  return (
    <Modal wide title={`Booking #${b.id}`} onClose={onClose}
      footer={<>
        {b.payment?.verified && <ReceiptDownload variant="secondary" load={() => api.admin.receipt(b.id)} />}
        <Button onClick={onClose}>Close</Button>
      </>}>
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
            <div className="bd-client">
              {!walkIn && apiPhotoSrc(client?.photoUrl, client?.photoDataUrl)
                ? <img className="bd-client-photo" src={apiPhotoSrc(client?.photoUrl, client?.photoDataUrl)} alt={`${client?.firstName}'s photo`} />
                : <span className="bd-client-photo" aria-hidden="true">{bookingClientName(b).slice(0, 1)}</span>}
              <div>
                <p className="bd-name">{bookingClientName(b)}</p>
                <p className="muted small">{bookingClientHandle(b)}</p>
              </div>
            </div>

            <ul className="bd-contact">
              {!walkIn && <li><a href={`mailto:${client?.email}`}>{client?.email}</a></li>}
              {bookingClientPhone(b) ? <li><a href={`tel:${bookingClientPhone(b)}`}>{bookingClientPhone(b)}</a></li>
                : walkIn && <li className="muted small">No phone number given</li>}
            </ul>
            {client?.adminNote && (
              <p className="bd-client-note"><span>Your note</span>{client.adminNote}</p>
            )}
          </Section>

          <Section title="Service">
            <dl className="bd-rows">
              {b.removalServiceName && (
                <Row label={<>Removal ({b.removalServiceName})<span className="bd-sub">Before the new set</span></>}><Money amount={b.removalPrice} /></Row>
              )}
              <Row label={b.serviceName}><Money amount={b.servicePrice} /></Row>
              {b.nailColor && (
                <Row label="Colour">
                  {colorFor(b.nailColor) && <span className="bd-swatch" style={{ background: colorFor(b.nailColor) }} aria-hidden="true" />}
                  {colorLabel(b.nailColor)}
                </Row>
              )}
              {b.perNailColors && (
                <Row label="Each nail"><span className="bd-nails">{perNailText(b.perNailColors)}</span></Row>
              )}
              {b.colorRequest && (
                <Row label="Colour request">
                  <span className="bd-color-request">
                    <span>{b.colorRequest}</span>
                    <span className={`color-request-badge is-${(b.colorRequestStatus ?? 'Pending').toLowerCase()}`}>{colorRequestLabel(b.colorRequestStatus)}</span>
                    {b.colorRequestStatus === 'Pending' && (b.status === 'Pending' || b.status === 'Confirmed') && (
                      <span className="bd-color-actions">
                        <Button size="sm" loading={deciding === 'yes'} disabled={Boolean(deciding)} onClick={() => decide(true)}>I have it</Button>
                        <Button size="sm" variant="secondary" loading={deciding === 'no'} disabled={Boolean(deciding)} onClick={() => decide(false)}>Not available</Button>
                      </span>
                    )}
                    {decideError && <span className="field-error">{decideError}</span>}
                  </span>
                </Row>
              )}
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
              {b.payment?.refundDue > 0 ? (
                <p className={b.payment.refundSentAt ? 'bd-check bd-check-ok' : 'bd-check bd-check-waiting'}>
                  {b.payment.refundSentAt
                    ? <>✓ Refund of <Money amount={b.payment.refundDue} /> sent{b.payment.refundReference && <>, reference <span className="mono">{b.payment.refundReference}</span></>}</>
                    : <>Refund owed to the client: <Money amount={b.payment.refundDue} /></>}
                </p>
              ) : (
                <p className="muted small">The <Money amount={b.depositAmount} /> deposit is non-refundable unless the salon cancels.</p>
              )}
              {b.termsVersion && (
                <p className="muted small">Booking policy and Terms v{b.termsVersion} agreed to{b.termsAcceptedAt ? ` on ${formatDateTime(b.termsAcceptedAt)}` : ''}.</p>
              )}
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
              {b.payment?.refundSentAt && <li><span>Refund sent</span><time>{formatDateTime(b.payment.refundSentAt)}</time></li>}
            </ol>
          </Section>
        </div>
      </div>
    </Modal>
  )
}
