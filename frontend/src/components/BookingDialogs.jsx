import { useState } from 'react'
import { Modal } from './Modal'
import { SlotPicker } from './SlotPicker'
import { Alert, Button, Field, Money, SelectField } from './ui'
import { errorMessage, fieldErrors } from '../api/errors'
import { formatDate, formatTime } from '../lib/format'
import { LIMITS } from '../validation/rules'
import { amountPaid, depositKept, refundFor } from '../lib/refunds'

/**
 * Cancellation dialog. Clients pick from their reasons (Ref 2.5), and "Others" asks them to write theirs;
 * administrators pick from theirs and may add an optional explanation (Ref 3.1, 3.2).
 */
export function CancelBookingDialog({ booking, reasons, allowExplanation = false, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [explanation, setExplanation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)
  const [explanationError, setExplanationError] = useState(null)
  // A client choosing "Others" must say why; the listed reasons need no words.
  const ownReason = !allowExplanation && reason === 'Others'

  const submit = async (e) => {
    e.preventDefault()
    if (!reason) {
      setFieldError('Select a cancellation reason.')
      return
    }
    if (ownReason && !explanation.trim()) {
      setExplanationError('Please tell us the reason.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(allowExplanation || ownReason ? { reason, explanation: explanation.trim() || null } : { reason })
    } catch (err) {
      setError(errorMessage(err))
      setFieldError(fieldErrors(err).reason ?? null)
      setExplanationError(fieldErrors(err).explanation ?? null)
      setSaving(false)
    }
  }

  return (
    <Modal title="Cancel booking" onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <p>
          {booking.serviceName} on <strong>{formatDate(booking.bookingDate)}</strong> at {formatTime(booking.startTime)}
        </p>
        <RefundNote booking={booking} bySalon={allowExplanation} reason={reason} />
        {error && <Alert kind="error">{error}</Alert>}
        <SelectField label="Reason for cancelling" required value={reason} placeholder="Select a reason"
          options={reasons} error={fieldError} onChange={(e) => { setReason(e.target.value); setFieldError(null); setExplanationError(null) }} />
        {ownReason && (
          <Field label="Your reason" required error={explanationError} counter={`${explanation.length}/${LIMITS.explanationMax}`}>
            {(aria) => (
              <textarea className="input" rows={3} maxLength={LIMITS.explanationMax} value={explanation} required autoFocus
                placeholder="e.g. I have to travel that week" onChange={(e) => { setExplanation(e.target.value); setExplanationError(null) }} {...aria} />
            )}
          </Field>
        )}
        {allowExplanation && (
          <Field label="Explanation (optional)" hint={`${explanation.length}/${LIMITS.explanationMax}`}>
            {(aria) => (
              <textarea className="input" rows={3} maxLength={LIMITS.explanationMax} value={explanation}
                onChange={(e) => setExplanation(e.target.value)} {...aria} />
            )}
          </Field>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Keep booking</Button>
          <Button type="submit" variant="danger" loading={saving}>Cancel booking</Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Records the balance a client paid after the service. When completing a booking (`completing`), Leyah can also say
 * it hasn't been paid yet and record it later from the booking's menu. Always the whole balance.
 */
export function BalanceDialog({ booking, completing = false, onSubmit, onClose }) {
  const [received, setReceived] = useState(true)
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setFieldError(null)
    try {
      await onSubmit({ received, reference: reference.trim() || null })
    } catch (err) {
      const problem = fieldErrors(err).balanceReference
      if (problem) setFieldError(problem)
      else setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title={completing ? 'Complete booking' : 'Record balance'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <p>
          {booking.client?.firstName} {booking.client?.lastName}, {booking.serviceName}<br />
          Balance: <strong><Money amount={booking.balanceDue} /></strong>
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        {completing && (
          <fieldset className="balance-options">
            <legend className="sr-only">Has the balance been paid?</legend>
            <label className={received ? 'balance-option selected' : 'balance-option'}>
              <input type="radio" name="balance-received" checked={received} onChange={() => setReceived(true)} />
              <span>Balance received</span>
            </label>
            <label className={received ? 'balance-option' : 'balance-option selected'}>
              <input type="radio" name="balance-received" checked={!received} onChange={() => setReceived(false)} />
              <span>Not paid yet</span>
            </label>
          </fieldset>
        )}
        {received ? (
          <Field label="GCash reference (optional)" error={fieldError}>
            {(aria) => <input className="input" maxLength={LIMITS.balanceReferenceMax} value={reference} onChange={(e) => setReference(e.target.value)} {...aria} />}
          </Field>
        ) : (
          <p className="muted small">The balance stays on the booking and in Reports until you record it from the booking&apos;s menu.</p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button type="submit" loading={saving}>{completing ? 'Complete booking' : 'Record balance'}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** What happens to the money if this booking is cancelled now, worded for whoever is cancelling. */
function RefundNote({ booking, bySalon, reason }) {
  const paid = amountPaid(booking)
  const refund = refundFor(booking, { bySalon, reason })
  if (bySalon) {
    if (!paid) return null
    if (reason === 'ClientDidNotRespond') {
      return (
        <Alert kind="info">
          The client keeps the usual rule: the <Money amount={depositKept(booking)} /> deposit is kept
          {refund > 0 ? <>, and <Money amount={refund} /> is refunded.</> : ', and nothing is refunded.'}
        </Alert>
      )
    }
    return (
      <Alert kind="info">
        The salon is cancelling, so the client gets back everything they paid: <strong><Money amount={paid} /></strong>, the deposit
        included. Send it by GCash or Maya, then record it from the booking&apos;s menu.
      </Alert>
    )
  }
  return refund > 0 ? (
    <Alert kind="info">
      You paid <Money amount={paid} />. The <Money amount={depositKept(booking)} /> deposit is non-refundable, so <strong><Money amount={refund} /></strong> will
      be refunded to the account you paid from.
    </Alert>
  ) : (
    <Alert kind="warning">The <Money amount={booking.depositAmount} /> booking deposit is non-refundable, so nothing is refunded.</Alert>
  )
}

/** Leyah sent a refund by GCash or Maya; the reference is optional. */
export function RefundDialog({ booking, onSubmit, onClose }) {
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setFieldError(null)
    try {
      await onSubmit({ refundReference: reference.trim() || null })
    } catch (err) {
      const problem = fieldErrors(err).refundReference
      if (problem) setFieldError(problem)
      else setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Record refund" onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <p>
          {booking.client?.firstName} {booking.client?.lastName}, booking #{booking.id}<br />
          Refund owed: <strong><Money amount={booking.payment?.refundDue ?? 0} /></strong>
        </p>
        <p className="muted small">Send it to the client by GCash or Maya first, then record it here.</p>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="GCash or Maya reference (optional)" error={fieldError}>
          {(aria) => <input className="input" maxLength={LIMITS.balanceReferenceMax} value={reference} onChange={(e) => setReference(e.target.value)} {...aria} />}
        </Field>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button type="submit" loading={saving}>Record refund sent</Button>
        </div>
      </form>
    </Modal>
  )
}

/** A no-show can't be undone, so it is confirmed first. */
export function NoShowDialog({ booking, onSubmit, onClose }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSubmit()
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Mark as no-show" onClose={onClose}>
      <div className="stack">
        <p>
          {booking.client?.firstName} {booking.client?.lastName} did not come on <strong>{formatDate(booking.bookingDate)}</strong> at {formatTime(booking.startTime)}?
        </p>
        <Alert kind="warning">
          The <Money amount={depositKept(booking)} /> deposit is kept as the no-show fee.
          {refundFor(booking) > 0 && <> The rest, <Money amount={refundFor(booking)} />, is owed back to the client.</>}
          {' '}This can&apos;t be undone.
        </Alert>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button variant="danger" loading={saving} onClick={confirm}>Mark as no-show</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Pick a new date and time for an existing booking. */
export function RescheduleDialog({ booking, onSubmit, onClose }) {
  const [date, setDate] = useState(booking.bookingDate)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!date || !time) {
      setError('Choose a new date and time.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ bookingDate: date, startTime: time })
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal title="Reschedule booking" onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="stack">
        <p className="muted">
          Currently {formatDate(booking.bookingDate)} at {formatTime(booking.startTime)}
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        <SlotPicker date={date} onDateChange={setDate} selectedTime={time} onTimeChange={setTime} serviceId={booking.serviceId}
          removalServiceId={booking.removalServiceId ?? undefined}
          keepTime={date === booking.bookingDate ? booking.startTime : undefined} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button type="submit" loading={saving} disabled={!time}>Save new time</Button>
        </div>
      </form>
    </Modal>
  )
}
