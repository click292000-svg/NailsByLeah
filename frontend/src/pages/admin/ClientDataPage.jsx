import { useState } from 'react'
import { api } from '../../api'
import { errorMessage } from '../../api/errors'
import { useAsync, useDebouncedValue } from '../../hooks/useAsync'
import { formatDateTime } from '../../lib/format'
import { Alert, Button, Card, PageHeader, PageLoader, Pager, Spinner, TextField } from '../../components/ui'
import { Modal } from '../../components/Modal'
import { apiPhotoSrc } from '../../lib/photos'

const CONFIRM_WORD = 'DELETE'
const PAGE_SIZE = 20

/**
 * Every registered client, A to Z by username, a page at a time, with a search by username, name, email or phone.
 * Opening one shows their details; from there their personal data can be deleted when they ask (Data Privacy Act of 2012).
 */
export default function ClientDataPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debounced = useDebouncedValue(search.trim(), 300)
  const list = useAsync(() => api.admin.searchClients({ search: debounced || null, page, pageSize: PAGE_SIZE }), [debounced, page])
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
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="stack-lg">
      <PageHeader title="Clients" subtitle="Everyone with an account, A to Z by username. Open one to see their details." />
      {deleted && (
        <Alert kind="success" title="The client's data was deleted." onClose={() => setDeleted(false)}>
          Their bookings and payments now show as "Deleted Client". Remember to delete emails about them from the salon's inbox.
        </Alert>
      )}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card title="All clients" actions={
        <span className="results-count">
          {list.loading && list.data && <Spinner small label="Refreshing" />}
          {list.data && `${total} client${total === 1 ? '' : 's'}`}
        </span>
      }>
        <div className="stack">
          <TextField label="Search clients" type="search" autoComplete="off" value={search} hint="Username, name, email or phone number"
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
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
          <Pager page={page} pages={pages} onChange={setPage} />
        </div>
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
