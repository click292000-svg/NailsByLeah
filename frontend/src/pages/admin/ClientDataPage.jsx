import { useState } from 'react'
import { api } from '../../api'
import { errorMessage, fieldErrors } from '../../api/errors'
import { validateEmail } from '../../validation/rules'
import { Alert, Button, Card, PageHeader, TextField } from '../../components/ui'
import { Modal } from '../../components/Modal'

const CONFIRM_WORD = 'DELETE'

/** A client asks for their data to be deleted (Data Privacy Act of 2012): find them by email, review, then erase. */
export default function ClientDataPage() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(null)
  const [client, setClient] = useState(null)
  const [error, setError] = useState(null)
  const [deleted, setDeleted] = useState(false)
  const [finding, setFinding] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const find = async (e) => {
    e.preventDefault()
    const problem = validateEmail(email)
    setEmailError(problem)
    setClient(null)
    setError(null)
    setDeleted(false)
    if (problem) return
    setFinding(true)
    try {
      setClient(await api.admin.findClient(email))
    } catch (err) {
      const fieldError = fieldErrors(err).email
      if (fieldError) setEmailError(fieldError)
      else setError(errorMessage(err))
    } finally {
      setFinding(false)
    }
  }

  const onDeleted = () => {
    setConfirming(false)
    setClient(null)
    setEmail('')
    setDeleted(true)
  }

  return (
    <div className="stack-lg">
      <PageHeader title="Client data" subtitle="Delete a client's personal data when they ask for it." />
      {deleted && (
        <Alert kind="success" title="The client's data was deleted." onClose={() => setDeleted(false)}>
          Their bookings and payments now show as "Deleted Client". Remember to delete emails about them from the salon's inbox.
        </Alert>
      )}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card title="Find the client">
        <form onSubmit={find} noValidate className="stack">
          <TextField label="Client's email address" type="email" autoComplete="off" required value={email} error={emailError}
            onChange={(e) => setEmail(e.target.value)} />
          <div><Button type="submit" loading={finding}>Find client</Button></div>
        </form>
      </Card>

      {client && (
        <Card title={`${client.firstName} ${client.lastName}`}>
          <dl className="detail-list">
            <dt>Username</dt><dd>@{client.username}</dd>
            <dt>Email</dt><dd>{client.email}</dd>
            <dt>Phone</dt><dd>{client.phoneNumber}</dd>
            <dt>Bookings</dt><dd>{client.bookingCount}</dd>
            <dt>Design photos</dt><dd>{client.photoCount}</dd>
            <dt>Feedback</dt><dd>{client.feedbackCount}</dd>
          </dl>
          {client.activeBookingCount > 0 ? (
            <Alert kind="warning" title="This client still has an open booking.">
              A pending or confirmed booking stays open until it is completed or cancelled. Complete or cancel{' '}
              {client.activeBookingCount === 1 ? 'it' : `all ${client.activeBookingCount}`} on the Bookings page first.
              A booking can be completed from its appointment date.
            </Alert>
          ) : (
            <div><Button variant="danger-ghost" onClick={() => setConfirming(true)}>Delete this client's data</Button></div>
          )}
        </Card>
      )}

      {confirming && <ConfirmDeleteDialog client={client} onDeleted={onDeleted} onClose={() => setConfirming(false)} />}
    </div>
  )
}

/** Says what goes and what stays. It can't be undone, so the button only works once DELETE has been typed. */
function ConfirmDeleteDialog({ client, onDeleted, onClose }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const erase = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.admin.deleteClientData(client.id)
      onDeleted()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={`Delete ${client.firstName} ${client.lastName}'s data?`} onClose={onClose} footer={
      <>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Keep the data</Button>
        <Button variant="danger-ghost" loading={busy} disabled={typed !== CONFIRM_WORD} onClick={erase}>Delete permanently</Button>
      </>
    }>
      <div className="stack">
        {error && <Alert kind="error">{error}</Alert>}
        <p><strong>This can't be undone.</strong></p>
        <div>
          <h3>Deleted</h3>
          <ul>
            <li>Name, username, email and phone number, and the account's sign-in</li>
            <li>Design photos, notes for Leyah, feedback comments and any saved booking</li>
            <li>Cancellation explanations and the account's security records</li>
          </ul>
        </div>
        <div>
          <h3>Kept, with no name attached</h3>
          <ul>
            <li>Bookings, payment amounts and reference numbers, so sales reports stay correct</li>
            <li>Star ratings, in the salon's totals</li>
          </ul>
        </div>
        <TextField label={`Type ${CONFIRM_WORD} to confirm`} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
    </Modal>
  )
}
