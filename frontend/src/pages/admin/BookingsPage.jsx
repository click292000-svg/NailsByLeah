import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../../api'
import { useAsync, useDebouncedValue } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { Alert, Button, Card, PageHeader, PageLoader, Spinner, TextField } from '../../components/ui'
import { AdminBookingTable } from './AdminBookingTable'

// Quick filters shown as chips; "Pending" is where new paid bookings wait for confirmation.
const STATUSES = [{ value: '', label: 'All' }, ...['Pending', 'Confirmed', 'Completed', 'Cancelled'].map((s) => ({ value: s, label: s }))]
const PAGE_SIZE = 20

/** Search and filter bookings by date, status or client name (Ref 11.5). Filters live in the URL. */
export default function BookingsPage() {
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? ''
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const [clientName, setClientName] = useState(params.get('clientName') ?? '')
  const debouncedName = useDebouncedValue(clientName.trim(), 300)
  const [message, setMessage] = useState(null)

  const results = useAsync(() => api.admin.searchBookings({ date, status, clientName: debouncedName, page, pageSize: PAGE_SIZE }),
    [date, status, debouncedName, page])

  const update = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries({ ...changes, page: changes.page ?? 1 }).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    if (next.get('page') === '1') next.delete('page')
    setParams(next, { replace: true })
  }

  const totalPages = results.data ? Math.max(1, Math.ceil(results.data.totalCount / PAGE_SIZE)) : 1

  return (
    <div className="stack">
      <PageHeader title="Bookings" />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <Card>
        <form className="filters filters-two" onSubmit={(e) => e.preventDefault()} role="search">
          <TextField label="Booking date" type="date" value={date} onChange={(e) => update({ date: e.target.value })} />
          <TextField label="Client name" type="search" placeholder="First, last or username" value={clientName}
            onChange={(e) => { setClientName(e.target.value); update({ clientName: e.target.value }) }} />
          <div className="filters-actions">
            <Button variant="ghost" onClick={() => { setClientName(''); setParams(new URLSearchParams(), { replace: true }) }}>Clear</Button>
          </div>
        </form>
        <div className="status-chips" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <button key={s.label} type="button" role="radio" aria-checked={status === s.value}
              className={`status-chip status-chip-${(s.value || 'all').toLowerCase()}${status === s.value ? ' selected' : ''}`}
              onClick={() => update({ status: s.value, date, clientName })}>
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        {results.loading && !results.data && <PageLoader label="Searching…" />}
        {results.error && <Alert kind="error">{errorMessage(results.error)}</Alert>}
        {results.data && (
          <>
            <div className="results-meta">
              <span>{results.data.totalCount} booking{results.data.totalCount === 1 ? '' : 's'}</span>
              {results.loading && <Spinner small label="Refreshing" />}
            </div>
            <AdminBookingTable bookings={results.data.items} onChanged={(text) => { setMessage(text); results.reload() }} />
            {totalPages > 1 && (
              <nav className="pager" aria-label="Pages">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1, date, status, clientName })}>Previous</Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => update({ page: page + 1, date, status, clientName })}>Next</Button>
              </nav>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
