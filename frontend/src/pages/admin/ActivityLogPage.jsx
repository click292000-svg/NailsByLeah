import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate, humanize } from '../../lib/format'
import { toIsoDate } from '../../lib/dates'

const dayLabel = (day) => (day.slice(0, 4) === String(new Date().getFullYear()) ? formatDate(day).replace(/, \d{4}$/, '') : formatDate(day))
import { Alert, Card, EmptyState, PageHeader, PageLoader, Pager, SelectField } from '../../components/ui'

const ACTIONS = [
  'BookingCreated', 'BookingConfirmed', 'BookingRescheduled', 'BookingCompleted', 'BookingCancelled',
  'PaymentSucceeded', 'PaymentFailed', 'ServiceCreated', 'ServiceUpdated', 'ServiceDeleted', 'SlotBlocked', 'SlotUnblocked',
  'UserRegistered', 'EmailVerified', 'LoginSucceeded', 'LoginFailed', 'AccountLocked', 'PasswordResetRequested', 'PasswordReset', 'ClientDataDeleted',
].map((a) => ({ value: a, label: humanize(a) }))

const PAGE_SIZE = 25

/** The colour of an entry's dot: problems red, payments green, bookings rose, price list and schedule amber, accounts blue. */
function tone(action) {
  if (/Failed|Locked|Deleted$/.test(action) && action !== 'ServiceDeleted') return 'problem'
  if (action.startsWith('Payment')) return 'payment'
  if (action.startsWith('Booking')) return 'booking'
  if (action.startsWith('Service') || action.startsWith('Slot')) return 'catalog'
  return 'account'
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** Who did what, and when (Ref 11.7). */
export default function ActivityLogPage() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const logs = useAsync(() => api.admin.activityLogs({ action, page, pageSize: PAGE_SIZE }), [action, page])
  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.totalCount / PAGE_SIZE)) : 1

  // Entries arrive newest first; consecutive entries from the same day share a day heading.
  const days = []
  for (const entry of logs.data?.items ?? []) {
    const day = toIsoDate(new Date(entry.createdAt))
    if (days.at(-1)?.day !== day) days.push({ day, entries: [] })
    days.at(-1).entries.push(entry)
  }

  return (
    <div className="stack-lg">
      <PageHeader title="Activity log" subtitle="Sign-ins, bookings, payments and price list changes, newest first." />
      <Card title="All activity" actions={
        <div className="card-filter">
          <SelectField label="Show" value={action} placeholder="All actions" options={ACTIONS}
            onChange={(e) => { setAction(e.target.value); setPage(1) }} />
        </div>
      }>
        {logs.loading && <PageLoader />}
        {logs.error && <Alert kind="error">{errorMessage(logs.error)}</Alert>}
        {logs.data && !logs.loading && (logs.data.items.length === 0 ? (
          <EmptyState title="No activity found">{action ? 'Try showing all actions.' : 'Activity appears here as people use the website.'}</EmptyState>
        ) : (
          <div className="activity">
            <div className="activity-head" aria-hidden="true">
              <span>Time</span><span>User</span><span>Action</span><span>Details</span>
            </div>
            {days.map(({ day, entries }) => (
              <section key={day} className="activity-day" aria-label={formatDate(day)}>
                {/* The date fits the Time column ("Wed, Nov 11"; the year only when it isn't this year); the count sits at the far end. */}
                <h3 className="list-group-title">
                  <span className="activity-day-date">{dayLabel(day)}</span>
                  <span className="activity-day-count">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
                </h3>
                {entries.map((entry) => (
                  <div key={entry.id} className="activity-row">
                    <span className="activity-time" data-label="Time">{timeOf(entry.createdAt)}</span>
                    <span className="activity-user" data-label="User" title={entry.username ? `@${entry.username}` : 'System'}>{entry.username ? `@${entry.username}` : <span className="muted">System</span>}</span>
                    <span className="activity-action" data-label="Action">
                      <span className={`activity-dot activity-dot-${tone(entry.action)}`} aria-hidden="true" />
                      <span>
                        {humanize(entry.action)}
                        {entry.entityType && <span className="activity-entity">{entry.entityType}{entry.entityId != null && ` #${entry.entityId}`}</span>}
                      </span>
                    </span>
                    <span className="activity-details" data-label="Details">
                      {entry.details ?? <span className="muted">—</span>}
                      {entry.ipAddress && <span className="activity-entity">From {entry.ipAddress}</span>}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        ))}
        <Pager page={page} pages={totalPages} onChange={setPage} />
      </Card>
    </div>
  )
}
