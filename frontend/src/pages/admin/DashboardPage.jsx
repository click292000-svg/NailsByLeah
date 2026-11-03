import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate } from '../../lib/format'
import { Alert, Card, Money, PageHeader, PageLoader } from '../../components/ui'
import { AdminBookingTable } from './AdminBookingTable'

/** Today's bookings, pending bookings and payments collected online (deposits and full payments, Ref 11.1). */
export default function DashboardPage() {
  const dashboard = useAsync(() => api.admin.dashboard(), [])
  const [message, setMessage] = useState(null)

  if (dashboard.loading && !dashboard.data) return <PageLoader label="Loading dashboard…" />
  if (dashboard.error) return <Alert kind="error">{errorMessage(dashboard.error)}</Alert>
  const d = dashboard.data

  return (
    <div className="stack">
      <PageHeader title="Dashboard" subtitle={formatDate(d.today)} />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <div className="stat-grid">
        <Stat label="Today's bookings" value={d.todaysBookingCount} />
        <Stat label="Pending bookings" value={d.pendingBookingCount}
          link={d.pendingBookingCount > 0 ? <Link to="/admin/bookings?status=Pending">Review</Link> : null} />
        <Stat label="Paid online today" value={<Money amount={d.depositsCollectedToday} />} />
        <Stat label="Total paid online" value={<Money amount={d.totalDepositsCollected} />} />
      </div>
      <Card title="Today's appointments" actions={<Link to="/admin/bookings">All bookings</Link>}>
        <AdminBookingTable bookings={d.todaysBookings} onChanged={(text) => { setMessage(text); dashboard.reload() }} />
      </Card>
    </div>
  )
}

function Stat({ label, value, link }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {link}
    </div>
  )
}
