import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { today } from '../../lib/dates'
import { formatDate, formatMoney } from '../../lib/format'
import { downloadSalesReport, totalReceived } from '../../lib/reportExcel'
import { Alert, Button, Card, Money, PageHeader, PageLoader, StatCard } from '../../components/ui'
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

/**
 * Money first, then booking counts. Each figure appears once: the total shows what it is made of underneath, and the
 * completed services show how many appointments they were.
 */
function Totals({ report }) {
  const finished = report.bookingsCompleted
  return (
    <div className="report-totals">
      <section aria-label="Sales">
        <h3 className="report-section-title">Sales</h3>
        <div className="stat-row stat-row-3">
          <StatCard label="Total received" value={<Money amount={totalReceived(report)} />}
            hint={`${formatMoney(report.depositsCollected)} online · ${formatMoney(report.balancesReceived)} in balances`} />
          <StatCard label="Completed services" value={<Money amount={report.completedServicesValue} />}
            hint={`${finished} appointment${finished === 1 ? '' : 's'} finished`} />
          <StatCard label="Balances unpaid" value={<Money amount={report.balancesUnpaid} />} hint="Completed, not recorded yet" />
        </div>
      </section>
      <section aria-label="Bookings">
        <h3 className="report-section-title">Bookings</h3>
        <div className="stat-row stat-row-3">
          <StatCard label="Made" value={report.bookingsMade} hint="New bookings placed" dot="made" />
          <StatCard label="Cancelled" value={report.bookingsCancelled} hint="By clients or the salon" dot="cancelled" />
          <StatCard label="No-show" value={report.bookingsNoShow} hint="Client did not come" dot="noshow" />
        </div>
      </section>
    </div>
  )
}

/** The period picker on the left and the Excel download on the right. The picker shows the period, so its title is only read out. */
function ReportHeader({ title, report, fileName, children }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  const download = async () => {
    setDownloading(true)
    setError(null)
    try {
      await downloadSalesReport({ period: title, report, fileName })
    } catch {
      setError('The Excel file could not be made. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div className="report-head">
        <h2 className="sr-only">{title}</h2>
        {children}
        <Button variant="secondary" className="report-download" loading={downloading} disabled={!report} onClick={download}>Download Excel</Button>
      </div>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
    </>
  )
}

function DailyReport() {
  const [date, setDate] = useState(today())
  const report = useAsync(() => api.admin.dailyReport(date), [date])
  return (
    <Card>
      <ReportHeader title={formatDate(date)} report={report.loading ? null : report.data} fileName={`nails-by-leyah-sales-${date}.xlsx`}>
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
      <ReportHeader title={new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
        report={report.loading ? null : report.data} fileName={`nails-by-leyah-sales-${value}.xlsx`}>
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
    <p className="muted small report-notes">Payments count on the day they were paid; everything else on the day it happened.</p>
  )
}
