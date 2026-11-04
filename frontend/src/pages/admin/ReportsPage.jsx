import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { today } from '../../lib/dates'
import { formatDate } from '../../lib/format'
import { Alert, Card, Money, PageHeader, PageLoader, StatCard } from '../../components/ui'
import { DayPicker, MonthPicker } from '../../components/DateFilter'

/** Daily and monthly sales reports (Ref 11.6). */
export default function ReportsPage() {
  const [tab, setTab] = useState('daily')
  return (
    <div className="stack">
      <PageHeader title="Sales reports" />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'daily'} className={tab === 'daily' ? 'tab active' : 'tab'} onClick={() => setTab('daily')}>Daily</button>
        <button type="button" role="tab" aria-selected={tab === 'monthly'} className={tab === 'monthly' ? 'tab active' : 'tab'} onClick={() => setTab('monthly')}>Monthly</button>
      </div>
      {tab === 'daily' ? <DailyReport /> : <MonthlyReport />}
    </div>
  )
}

/** Sales first, then booking counts; every card has a label, a value and a one-line explanation. */
function Totals({ report }) {
  return (
    <div className="report-totals">
      <section aria-label="Sales">
        <h3 className="report-section-title">Sales</h3>
        <div className="stat-row stat-row-2">
          <StatCard label="Paid online" value={<Money amount={report.depositsCollected} />} hint="Deposits and full payments received" />
          <StatCard label="Completed services" value={<Money amount={report.completedServicesValue} />} hint="Full price of appointments completed" />
        </div>
      </section>
      <section aria-label="Bookings">
        <h3 className="report-section-title">Bookings</h3>
        <div className="stat-row stat-row-3">
          <StatCard label="Made" value={report.bookingsMade} hint="New bookings placed" dot="made" />
          <StatCard label="Completed" value={report.bookingsCompleted} hint="Appointments finished" dot="completed" />
          <StatCard label="Cancelled" value={report.bookingsCancelled} hint="By clients or the salon" dot="cancelled" />
        </div>
      </section>
    </div>
  )
}

/** The period's title on the left and its picker on the right, so the report reads top to bottom. */
function ReportHeader({ title, children }) {
  return (
    <div className="report-head">
      <h2>{title}</h2>
      <div className="report-controls">{children}</div>
    </div>
  )
}

function DailyReport() {
  const [date, setDate] = useState(today())
  const report = useAsync(() => api.admin.dailyReport(date), [date])
  return (
    <Card>
      <ReportHeader title={formatDate(date)}>
        <DayPicker label="Day" value={date} onChange={(value) => value && setDate(value)} align="end" />
      </ReportHeader>
      {report.loading && <PageLoader label="Building report…" />}
      {report.error && <Alert kind="error">{errorMessage(report.error)}</Alert>}
      {report.data && !report.loading && <Totals report={report.data} />}
      <ReportNotes />
    </Card>
  )
}

function MonthlyReport() {
  const [value, setValue] = useState(today().slice(0, 7))
  const [year, month] = value.split('-').map(Number)
  const report = useAsync(() => api.admin.monthlyReport(year, month), [year, month])

  return (
    <Card>
      <ReportHeader title={new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}>
        <MonthPicker label="Month" value={value} onChange={setValue} align="end" />
      </ReportHeader>
      {report.loading && <PageLoader label="Building report…" />}
      {report.error && <Alert kind="error">{errorMessage(report.error)}</Alert>}
      {report.data && !report.loading && <Totals report={report.data} />}
      <ReportNotes />
    </Card>
  )
}

function ReportNotes() {
  return (
    <p className="muted small report-notes">
      Online payments (deposits and full payments) are counted on the day they were paid. Completed services value is the full price of appointments
      completed that day. Bookings made and cancelled are counted on the day it happened.
    </p>
  )
}
