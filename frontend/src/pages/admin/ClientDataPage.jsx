import { useState } from 'react'
import { api } from '../../api'
import { errorMessage } from '../../api/errors'
import { useAsync, useDebouncedValue } from '../../hooks/useAsync'
import { formatDateTime } from '../../lib/format'
import { Alert, Button, Card, PageHeader, PageLoader, Spinner, TextField } from '../../components/ui'
import { Modal } from '../../components/Modal'
import { LIST_PAGE_SIZE, ListPaging, usePageParam } from '../../components/ListPaging'
import { apiPhotoSrc } from '../../lib/photos'
import { LIMITS } from '../../validation/rules'

const CONFIRM_WORD = 'DELETE'

/**
 * Every registered client, A to Z by username, a page at a time, with a search by username, name, email or phone.
 * Opening one shows their details; from there their personal data can be deleted when they ask (Data Privacy Act of 2012).
 */
export default function ClientDataPage() {
  const [search, setSearch] = useState('')
  // 10 a page like Find bookings and the Activity log; the page is in the address and a new search starts at page 1.
  const { page, goTo, reset } = usePageParam('.clients-card')
  const debounced = useDebouncedValue(search.trim(), 300)
  const list = useAsync(() => api.admin.searchClients({ search: debounced || null, page, pageSize: LIST_PAGE_SIZE }), [debounced, page])
  const [client, setClient] = useState(null)
  const [error, setError] = useState(null)
  const [deleted, setDeleted] = useState(false)
  const [opening, setOpening] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const open = async (id) => {
    setOpening(id)
    setError(null)
    setDeleted(false)
    try {
      setClient(await api.admin.client(id))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setOpening(null)
    }
  }

  const onDeleted = () => {
    setConfirming(false)
    setClient(null)
    setDeleted(true)
    list.reload()
  }

  const total = list.data?.totalCount ?? 0

  return (
    <div className="stack-lg">
      <PageHeader title="Clients" subtitle="Everyone with an account, A to Z by username. Open one to see their details." />
      {deleted && (
        <Alert kind="success" title="The client's data was deleted." onClose={() => setDeleted(false)}>
          Their bookings and payments now show as "Deleted Client". Remember to delete emails about them from the salon's inbox.
        </Alert>
      )}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card className="clients-card" title="All clients" actions={
        <span className="results-count">
          {list.loading && list.data && <Spinner small label="Refreshing" />}
          {list.data && `${total} client${total === 1 ? '' : 's'}`}
        </span>
      }>
        <div className="stack">
          <TextField label="Search clients" type="search" autoComplete="off" value={search} hint="Username, name, email or phone number"
            onChange={(e) => { setSearch(e.target.value); reset() }} />
          {list.loading && !list.data && <PageLoader label="Loading clients…" />}
          {list.error && <Alert kind="error">{errorMessage(list.error)}</Alert>}
          {list.data && list.data.items.length === 0 && (
            <p className="muted">{debounced ? 'No clients match that search.' : 'New clients show up here once they sign up.'}</p>
          )}
          {list.data && list.data.items.length > 0 && (
            <div className="table-wrap">
              <table className="data-table client-table">
                <thead>
                  <tr><th>Username</th><th>Name</th><th>Email</th><th>Phone</th><th>Signed up</th><th><span className="sr-only">Open</span></th></tr>
                </thead>
                <tbody>
                  {list.data.items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="client-cell">
                          {apiPhotoSrc(c.photoUrl, c.photoDataUrl)
                            ? <img className="client-avatar" src={apiPhotoSrc(c.photoUrl, c.photoDataUrl)} alt="" />
                            : <span className="client-avatar" data-initial={c.firstName.slice(0, 1)} aria-hidden="true" />}
                          @{c.username}
                        </span>
                      </td>
                      <td>{c.firstName} {c.lastName}</td>
                      <td>{c.email}{!c.emailVerified && <span className="muted small"> (not verified)</span>}</td>
                      <td>{c.phoneNumber}</td>
                      <td>{formatDateTime(c.createdAt)}</td>
                      <td>
                        <Button variant="secondary" size="sm" loading={opening === c.id} onClick={() => open(c.id)}
                          aria-label={`Open @${c.username}`}>Open</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ListPaging page={page} count={total} onChange={goTo} noun={['client', 'clients']} />
        </div>
      </Card>

      {client && (
        <Card title={`${client.firstName} ${client.lastName}`}>
          <dl className="detail-list">
            <dt>Username</dt><dd>@{client.username}</dd>
            <dt>Email</dt><dd>{client.email}</dd>
            <dt>Phone</dt><dd>{client.phoneNumber}</dd>
            <dt>Bookings</dt><dd>{client.bookingCount}</dd>
            <dt>Cancelled</dt><dd>{client.cancelledCount ?? 0}</dd>
            <dt>No-shows</dt>
            <dd className={client.noShowCount > 0 ? 'client-noshows' : undefined}>
              {client.noShowCount ?? 0}{client.noShowCount >= 2 && ' · consider asking for the full payment next time'}
            </dd>
            <dt>Design photos</dt><dd>{client.photoCount}</dd>
            <dt>Feedback</dt><dd>{client.feedbackCount}</dd>
          </dl>
          <ClientNote key={client.id} client={client} onSaved={setClient} />
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

/** Leyah's private note about the client: shown with their bookings, never to the client. */
function ClientNote({ client, onSaved }) {
  const [text, setText] = useState(client.adminNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const dirty = text.trim() !== (client.adminNote ?? '')

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      onSaved(await api.admin.updateClientNote(client.id, text.trim() || null))
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="client-note">
      <div className="pick-title-row">
        <label htmlFor="client-note" className="field-label pick-title">Your private note</label>
        <span className="field-counter">{text.length}/{LIMITS.adminNoteMax}</span>
      </div>
      <textarea id="client-note" className="input textarea" rows={2} maxLength={LIMITS.adminNoteMax} value={text}
        placeholder="e.g. Prefers short almond. Sensitive cuticles." onChange={(e) => { setText(e.target.value); setSaved(false) }} />
      <p className="muted small">Only you see this. It shows in this client&apos;s booking details.</p>
      {error && <div className="field-error">{error}</div>}
      <div className="client-note-actions">
        {saved && !dirty && <span className="muted small">Saved</span>}
        <Button size="sm" variant="secondary" loading={saving} disabled={!dirty} onClick={save}>Save note</Button>
      </div>
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
            <li>Profile photo, design photos, notes for Leyah, feedback comments and any saved booking</li>
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
