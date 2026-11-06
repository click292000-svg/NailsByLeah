import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../../api'
import { useAsync, useDebouncedValue } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { Alert, Button, Card, PageHeader, PageLoader, Pager, Spinner, TextField } from '../../components/ui'
import { DateFilter } from '../../components/DateFilter'
import { AdminBookingTable } from './AdminBookingTable'

// Quick filters shown as chips; "Pending" is where new paid bookings wait for confirmation.
const STATUSES = [
  { value: '', label: 'All' },
  ...['Pending', 'Confirmed', 'Completed', 'Cancelled'].map((s) => ({ value: s, label: s })),
  { value: 'NoShow', label: 'No-show' },
]
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

  const filtered = Boolean(date || status || clientName)
  const clear = () => { setClientName(''); setParams(new URLSearchParams(), { replace: true }) }
  const totalPages = results.data ? Math.max(1, Math.ceil(results.data.totalCount / PAGE_SIZE)) : 1
  const count = results.data?.totalCount ?? 0

  return (
    <div className="stack-lg">
      <PageHeader title="Bookings" subtitle="Find a booking, then confirm, reschedule, complete or cancel it." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}

      <Card title="Find bookings" actions={filtered ? <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button> : null}>
        <form className="booking-filters" onSubmit={(e) => e.preventDefault()} role="search">
          <DateFilter label="Booking date" value={date} onChange={(value) => update({ date: value, status, clientName })} />
          <div className="booking-filters-row">
            <div className="booking-filters-search">
              <TextField label="Client" type="search" placeholder="First name, last name or username" value={clientName}
                onChange={(e) => { setClientName(e.target.value); update({ clientName: e.target.value, date, status }) }} />
            </div>
            <div className="booking-filters-status">
              <span className="field-label" id="status-filter-label">Status</span>
              <div className="status-chips" role="radiogroup" aria-labelledby="status-filter-label">
                {STATUSES.map((s) => (
                  <button key={s.label} type="button" role="radio" aria-checked={status === s.value}
                    className={`status-chip status-chip-${(s.value || 'all').toLowerCase()}${status === s.value ? ' selected' : ''}`}
                    onClick={() => update({ status: s.value, date, clientName })}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>
      </Card>

      <Card title="Results" actions={
        <span className="results-count">
          {results.loading && results.data && <Spinner small label="Refreshing" />}
          {results.data && `${count} booking${count === 1 ? '' : 's'}`}
        </span>
      }>
        {results.loading && !results.data && <PageLoader label="Searching…" />}
        {results.error && <Alert kind="error">{errorMessage(results.error)}</Alert>}
        {results.data && (
          <>
            <AdminBookingTable bookings={results.data.items} onChanged={(text) => { setMessage(text); results.reload() }}
              emptyText={filtered ? 'Try another date or status, or clear the filters.' : 'New bookings show up here.'} />
            <Pager page={page} pages={totalPages} onChange={(p) => update({ page: p, date, status, clientName })} />
          </>
        )}
      </Card>
    </div>
  )
}
