import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate } from '../../lib/format'
import { Alert, Card, Money, PageHeader, PageLoader, StatCard } from '../../components/ui'
import { AdminBookingTable } from './AdminBookingTable'

/** Today's bookings, pending bookings and payments collected online (deposits and full payments, Ref 11.1). */
export default function DashboardPage() {
  const dashboard = useAsync(() => api.admin.dashboard(), [])
  const [message, setMessage] = useState(null)

  if (dashboard.loading && !dashboard.data) return <PageLoader label="Loading dashboard…" />
  if (dashboard.error) return <Alert kind="error">{errorMessage(dashboard.error)}</Alert>
  const d = dashboard.data

  return (
    <div className="stack-lg">
      <PageHeader title="Dashboard" subtitle={formatDate(d.today)} />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}

      <div className="dashboard-stats">
        <section aria-label="Bookings">
          <h2 className="report-section-title">Bookings</h2>
          <div className="stat-row stat-row-2">
            <StatCard label="Today's appointments" value={d.todaysBookingCount} hint="On today's schedule" dot="made" />
            <StatCard label="Waiting for you" value={d.pendingBookingCount} dot="pending"
              hint={d.pendingBookingCount > 0 ? 'Paid, not confirmed yet' : 'Nothing to confirm'}
              action={d.pendingBookingCount > 0 ? <Link to="/admin/bookings?status=Pending">Review</Link> : null} />
          </div>
        </section>
        <section aria-label="Paid online">
          <h2 className="report-section-title">Paid online</h2>
          <div className="stat-row stat-row-2">
            <StatCard label="Today" value={<Money amount={d.depositsCollectedToday} />} hint="Deposits and full payments" />
            <StatCard label="All time" value={<Money amount={d.totalDepositsCollected} />} hint="Since the website opened" />
          </div>
        </section>
      </div>

      <Card title="Today's appointments" actions={<Link to="/admin/bookings" className="card-link">All bookings →</Link>}>
        <p className="card-intro">Confirm new bookings and mark finished appointments as completed.</p>
        <AdminBookingTable bookings={d.todaysBookings} onChanged={(text) => { setMessage(text); dashboard.reload() }}
          emptyTitle="No appointments today" emptyText="Bookings for today show up here." />
      </Card>
    </div>
  )
}
