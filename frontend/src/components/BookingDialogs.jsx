import { useState } from 'react'
import { Modal } from './Modal'
import { SlotPicker } from './SlotPicker'
import { Alert, Button, Field, Money, SelectField } from './ui'
import { errorMessage, fieldErrors } from '../api/errors'
import { formatDate, formatTime } from '../lib/format'
import { LIMITS } from '../validation/rules'

/**
 * Cancellation dialog. Clients pick from their reasons (Ref 2.5); administrators pick from theirs
 * and may add an optional explanation (Ref 3.1, 3.2).
 */
export function CancelBookingDialog({ booking, reasons, allowExplanation = false, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [explanation, setExplanation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!reason) {
      setFieldError('Select a cancellation reason.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit(allowExplanation ? { reason, explanation: explanation.trim() || null } : { reason })
    } catch (err) {
      setError(errorMessage(err))
      setFieldError(fieldErrors(err).reason ?? null)
      setSaving(false)
    }
  }

  return (
    <Modal title="Cancel booking" onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack">
        <p>
          {booking.serviceName} on <strong>{formatDate(booking.bookingDate)}</strong> at {formatTime(booking.startTime)}
        </p>
        <Alert kind="warning">The booking deposit is non-refundable.</Alert>
        {error && <Alert kind="error">{error}</Alert>}
        <SelectField label="Reason for cancelling" required value={reason} placeholder="Select a reason"
          options={reasons} error={fieldError} onChange={(e) => { setReason(e.target.value); setFieldError(null) }} />
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
        <Alert kind="warning">The <Money amount={booking.depositAmount} /> deposit is kept. This can&apos;t be undone.</Alert>
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
          keepTime={date === booking.bookingDate ? booking.startTime : undefined} />
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Back</Button>
          <Button type="submit" loading={saving} disabled={!time}>Save new time</Button>
        </div>
      </form>
    </Modal>
  )
}
