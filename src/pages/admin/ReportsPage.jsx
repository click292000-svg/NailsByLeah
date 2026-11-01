import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { today } from '../../lib/dates'
import { formatDate, formatMoney } from '../../lib/format'
import { Alert, Card, Money, PageHeader, PageLoader, TextField } from '../../components/ui'

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

function Totals({ report }) {
  return (
    <div className="stat-grid">
      <div className="stat"><span className="stat-label">Deposits collected</span><span className="stat-value"><Money amount={report.depositsCollected} /></span></div>
      <div className="stat"><span className="stat-label">Completed services value</span><span className="stat-value"><Money amount={report.completedServicesValue} /></span></div>
      <div className="stat"><span className="stat-label">Bookings made</span><span className="stat-value">{report.bookingsMade}</span></div>
      <div className="stat"><span className="stat-label">Completed</span><span className="stat-value">{report.bookingsCompleted}</span></div>
      <div className="stat"><span className="stat-label">Cancelled</span><span className="stat-value">{report.bookingsCancelled}</span></div>
    </div>
  )
}

function DailyReport() {
  const [date, setDate] = useState(today())
  const report = useAsync(() => api.admin.dailyReport(date), [date])
  return (
    <Card>
      <div className="report-controls">
        <TextField label="Day" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      {report.loading && <PageLoader label="Building report…" />}
      {report.error && <Alert kind="error">{errorMessage(report.error)}</Alert>}
      {report.data && !report.loading && (
        <>
          <h2>{formatDate(report.data.date)}</h2>
          <Totals report={report.data} />
        </>
      )}
      <ReportNotes />
    </Card>
  )
}

function MonthlyReport() {
  const [value, setValue] = useState(today().slice(0, 7))
  const [year, month] = value.split('-').map(Number)
  const report = useAsync(() => api.admin.monthlyReport(year, month), [year, month])
  const max = report.data ? Math.max(1, ...report.data.days.map((d) => d.depositsCollected)) : 1

  return (
    <Card>
      <div className="report-controls">
        <TextField label="Month" type="month" value={value} onChange={(e) => e.target.value && setValue(e.target.value)} />
      </div>
      {report.loading && <PageLoader label="Building report…" />}
      {report.error && <Alert kind="error">{errorMessage(report.error)}</Alert>}
      {report.data && !report.loading && (
        <>
          <h2>{new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</h2>
          <Totals report={report.data} />
          <h3>Deposits collected per day</h3>
          <div className="bar-chart" role="img" aria-label="Deposits collected per day">
            {report.data.days.map((d) => (
              <div key={d.date} className="bar-col" title={`${formatDate(d.date)}: ${formatMoney(d.depositsCollected)}`}>
                <div className="bar" style={{ height: `${(d.depositsCollected / max) * 100}%` }} />
                <span className="bar-label">{Number(d.date.slice(8))}</span>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr><th>Date</th><th>Made</th><th>Completed</th><th>Cancelled</th><th>Deposits</th><th>Completed value</th></tr>
              </thead>
              <tbody>
                {report.data.days.filter((d) => d.bookingsMade || d.bookingsCompleted || d.bookingsCancelled || d.depositsCollected).map((d) => (
                  <tr key={d.date}>
                    <td data-label="Date">{formatDate(d.date)}</td>
                    <td data-label="Made">{d.bookingsMade}</td>
                    <td data-label="Completed">{d.bookingsCompleted}</td>
                    <td data-label="Cancelled">{d.bookingsCancelled}</td>
                    <td data-label="Deposits"><Money amount={d.depositsCollected} /></td>
                    <td data-label="Completed value"><Money amount={d.completedServicesValue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ReportNotes />
    </Card>
  )
}

function ReportNotes() {
  return (
    <p className="muted small">
      Deposits are counted on the day they were paid. Completed services value is the full price of appointments
      completed that day. Bookings made and cancelled are counted on the day it happened.
    </p>
  )
}
