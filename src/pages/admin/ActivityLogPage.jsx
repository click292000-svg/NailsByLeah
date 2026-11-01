import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDateTime, humanize } from '../../lib/format'
import { Alert, Button, Card, EmptyState, PageHeader, PageLoader, SelectField } from '../../components/ui'

const ACTIONS = [
  'BookingCreated', 'BookingConfirmed', 'BookingRescheduled', 'BookingCompleted', 'BookingCancelled',
  'PaymentSucceeded', 'PaymentFailed', 'ServiceCreated', 'ServiceUpdated', 'ServiceDeleted', 'SlotBlocked', 'SlotUnblocked',
  'UserRegistered', 'EmailVerified', 'LoginSucceeded', 'LoginFailed', 'AccountLocked', 'PasswordResetRequested', 'PasswordReset',
].map((a) => ({ value: a, label: humanize(a) }))

const PAGE_SIZE = 25

/** Who did what, and when (Ref 11.7). */
export default function ActivityLogPage() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const logs = useAsync(() => api.admin.activityLogs({ action, page, pageSize: PAGE_SIZE }), [action, page])
  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.totalCount / PAGE_SIZE)) : 1

  return (
    <div className="stack">
      <PageHeader title="Activity log" />
      <Card>
        <div className="filters">
          <SelectField label="Action" value={action} placeholder="All actions" options={ACTIONS}
            onChange={(e) => { setAction(e.target.value); setPage(1) }} />
        </div>
        {logs.loading && <PageLoader />}
        {logs.error && <Alert kind="error">{errorMessage(logs.error)}</Alert>}
        {logs.data && !logs.loading && (logs.data.items.length === 0 ? <EmptyState title="No activity found" /> : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date &amp; time</th><th>User</th><th>Action</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {logs.data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label="When">{formatDateTime(entry.createdAt)}</td>
                      <td data-label="User">{entry.username ? `@${entry.username}` : <span className="muted">System</span>}</td>
                      <td data-label="Action">
                        {humanize(entry.action)}
                        {entry.entityType && <div className="muted small">{entry.entityType} {entry.entityId}</div>}
                      </td>
                      <td data-label="Details">{entry.details ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pager" aria-label="Pages">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>Page {page} of {totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </nav>
          </>
        ))}
      </Card>
    </div>
  )
}
