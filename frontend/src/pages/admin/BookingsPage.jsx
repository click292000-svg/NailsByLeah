import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../../api'
import { useAsync, useDebouncedValue } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { addDays, daysInMonth, toIsoDate, today } from '../../lib/dates'
import { formatDate } from '../../lib/format'
import { Alert, Button, Card, PageLoader, Pager, Spinner } from '../../components/ui'
import { AdminBookingTable } from './AdminBookingTable'
import { bookingClientName } from '../../lib/bookingClient'
import { NewBookingDialog } from './NewBookingDialog'

const Icon = ({ children }) => (
  <svg className="fb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
)
const CalendarIcon = () => <Icon><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>
const ListIcon = () => <Icon><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></Icon>
const CheckIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 10" /></Icon>
const CrossIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></Icon>
const BanIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></Icon>
const ClockIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
const SearchIcon = () => <Icon><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></Icon>
const DownloadIcon = () => <Icon><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Icon>

// The tabs filter the All bookings list; "Pending" is where new paid bookings wait for confirmation.
const STATUSES = [
  { value: '', label: 'All bookings', title: 'All bookings', icon: <CalendarIcon /> },
  { value: 'Pending', label: 'Pending', title: 'Pending bookings', icon: <ClockIcon /> },
  { value: 'Confirmed', label: 'Confirmed', title: 'Confirmed bookings', icon: <CheckIcon /> },
  { value: 'Completed', label: 'Completed', title: 'Completed bookings', icon: <CheckIcon /> },
  { value: 'Cancelled', label: 'Cancelled', title: 'Cancelled bookings', icon: <CrossIcon /> },
  { value: 'NoShow', label: 'No-show', title: 'No-shows', icon: <BanIcon /> },
]
const PAGE_SIZE = 10 // bookings per page
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PANELS_KEY = 'nbl.bookingPanels'

const readPanels = () => {
  try {
    return JSON.parse(localStorage.getItem(PANELS_KEY)) ?? {}
  } catch {
    return {}
  }
}

/**
 * Find bookings (Ref 11.5). Two optional panels sit on top: a month calendar showing which days have bookings, and the
 * bookings of the day picked on it. They only look at that day; the All bookings list below keeps its own filters
 * (status tab, search, date, service), which live in the URL. Panels stay mounted once opened, so hiding and showing
 * them again keeps the chosen day and month and doesn't load anything again.
 */
export default function BookingsPage() {
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? ''
  const status = params.get('status') ?? ''
  const serviceId = params.get('serviceId') ?? ''
  const [search, setSearch] = useState(params.get('clientName') ?? '')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const [message, setMessage] = useState(null)
  const [creating, setCreating] = useState(false)
  const [refresh, setRefresh] = useState(0) // any booking change reloads the list, the calendar and the day

  const [panels, setPanels] = useState(() => ({ calendar: false, day: false, ...readPanels() }))
  const [opened, setOpened] = useState(panels) // a panel is only loaded once it has been opened
  const [day, setDay] = useState(today())
  const setPanel = (name, open) => {
    const next = { ...panels, [name]: open }
    setPanels(next)
    if (next[name]) setOpened((o) => ({ ...o, [name]: true }))
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(next))
    } catch {
      // Only remembers the choice for next time; works without it.
    }
  }

  const catalog = useAsync(() => api.admin.services(), [])
  // 10 bookings a page; the page is in the address (?page=2), and a new filter goes back to page 1.
  const page = Math.max(1, Number(params.get('page')) || 1)
  const results = useAsync(() => api.admin.searchBookings({ date, status, clientName: debouncedSearch, serviceId, page, pageSize: PAGE_SIZE }),
    [date, status, debouncedSearch, serviceId, page, refresh])
  const goToPage = (n) => {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    setParams(next, { replace: true })
    document.querySelector('.fb-list')?.scrollIntoView?.({ block: 'start' }) // back to the top of the list
  }

  const update = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    next.delete('page') // a new filter starts again at page 1
    setParams(next, { replace: true })
  }

  const changed = (text) => {
    setMessage(text)
    setRefresh((n) => n + 1)
  }

  const filtered = Boolean(date || status || search || serviceId)
  const clear = () => { setSearch(''); setParams(new URLSearchParams(), { replace: true }) }
  const count = results.data?.totalCount ?? 0
  const loaded = results.data?.items.length ?? 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const tab = STATUSES.find((s) => s.value === status) ?? STATUSES[0]
  const both = panels.calendar && panels.day

  return (
    <div className="stack-lg find-bookings">
      <h1 className="fb-title">Find bookings</h1>
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {creating && (
        <NewBookingDialog onClose={() => setCreating(false)} onCreated={(b) => {
          setCreating(false)
          changed(`Booking #${b.id} made for ${bookingClientName(b)} and confirmed.`)
        }} />
      )}

      <div className="fb-toggles">
        <Button className="fb-new" onClick={() => setCreating(true)}>+ New booking</Button>
        <button type="button" className={panels.calendar ? 'fb-toggle is-on' : 'fb-toggle'} aria-expanded={panels.calendar}
          aria-controls="fb-calendar" onClick={() => setPanel('calendar', !panels.calendar)}>
          <CalendarIcon /> {panels.calendar ? 'Hide calendar' : 'Show calendar'}
        </button>
        <button type="button" className={panels.day ? 'fb-toggle is-on' : 'fb-toggle'} aria-expanded={panels.day}
          aria-controls="fb-day" onClick={() => setPanel('day', !panels.day)}>
          <ListIcon /> {panels.day ? 'Hide booking details' : 'Show booking details'}
        </button>
      </div>

      <div className={`fb-panels${panels.calendar || panels.day ? ' is-open' : ''}${both ? ' is-both' : ''}`}>
        <Collapse id="fb-calendar" open={panels.calendar}>
          {/* Picking a day shows its bookings, opening that panel beside the calendar if it was hidden. */}
          {opened.calendar && <MonthCalendar value={day} onChange={(d) => { setDay(d); if (!panels.day) setPanel('day', true) }} refresh={refresh} />}
        </Collapse>
        <Collapse id="fb-day" open={panels.day}>
          {opened.day && <DayBookings date={day} refresh={refresh} onChanged={changed} />}
        </Collapse>
      </div>

      <div className="fb-tabs" role="tablist" aria-label="Booking status">
        {STATUSES.map((s) => (
          <button key={s.label} type="button" role="tab" aria-selected={status === s.value}
            className={status === s.value ? 'fb-tab selected' : 'fb-tab'} onClick={() => update({ status: s.value, date, clientName: search, serviceId })}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <Card className="fb-list" title={tab.title} actions={
        <span className="results-count">
          {results.loading && results.data && <Spinner small label="Refreshing" />}
          {results.data && `${count} booking${count === 1 ? '' : 's'}`}
        </span>
      }>
        <form className="fb-filters" onSubmit={(e) => e.preventDefault()} role="search">
          <label className="fb-search">
            <SearchIcon />
            <span className="sr-only">Search bookings</span>
            <input className="input" type="search" placeholder="Search client, service or reference" value={search}
              onChange={(e) => { setSearch(e.target.value); update({ clientName: e.target.value, date, status, serviceId }) }} />
          </label>
          <DateSelect value={date} onChange={(value) => update({ date: value, status, clientName: search, serviceId })} />
          <label className="fb-select">
            <span className="sr-only">Service</span>
            <select className="input" value={serviceId} onChange={(e) => update({ serviceId: e.target.value, date, status, clientName: search })}>
              <option value="">All services</option>
              {(catalog.data?.services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.category === 'Removal' ? ' (removal)' : ''}</option>)}
            </select>
          </label>
          <div className="fb-filter-actions">
            {filtered && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}
            <ExportButton query={{ date, status, clientName: debouncedSearch, serviceId }} disabled={!count} />
          </div>
        </form>

        {results.loading && !results.data && <PageLoader label="Searching…" />}
        {results.error && <Alert kind="error">{errorMessage(results.error)}</Alert>}
        {results.data && (
          <>
            <AdminBookingTable bookings={results.data.items} onChanged={changed}
              emptyText={filtered ? 'Try another date, status or service, or clear the filters.' : 'New bookings show up here.'} />
            {loaded > 0 && (
              <div className="fb-more">
                <span className="muted small">
                  {count > PAGE_SIZE ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, count)} of ${count}` : `All ${count} booking${count === 1 ? '' : 's'} shown`}
                </span>
                <Pager page={page} pages={pages} onChange={goToPage} />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

/** Shows or hides its content with a height animation; hidden content is taken out of the tab order too. */
function Collapse({ id, open, children }) {
  return (
    <div id={id} className={open ? 'fb-collapse is-open' : 'fb-collapse'} inert={!open} aria-hidden={!open}>
      <div className="fb-collapse-inner">{children}</div>
    </div>
  )
}

/** "All dates", "Today", "Tomorrow" or one picked date, for the All bookings list. */
function DateSelect({ value, onChange }) {
  const now = today()
  const tomorrow = addDays(now, 1)
  const mode = !value ? '' : value === now ? 'today' : value === tomorrow ? 'tomorrow' : 'pick'
  return (
    <div className="fb-date">
      <label className="fb-select">
        <CalendarIcon />
        <span className="sr-only">Booking date</span>
        <select className="input" value={mode} onChange={(e) => {
          const next = e.target.value
          onChange(next === 'today' ? now : next === 'tomorrow' ? tomorrow : next === 'pick' ? value || now : '')
        }}>
          <option value="">All dates</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="pick">Pick a date…</option>
        </select>
      </label>
      {mode === 'pick' && (
        <input className="input fb-date-input" type="date" aria-label="Pick a booking date" value={value}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

/** Downloads the bookings matching the list's filters (every page) as a spreadsheet file. */
function ExportButton({ query, disabled }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const rows = []
      for (let page = 1; page <= 50; page++) {
        const result = await api.admin.searchBookings({ ...query, page, pageSize: 100 })
        rows.push(...result.items)
        if (rows.length >= result.totalCount || !result.items.length) break
      }
      downloadCsv(rows)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="secondary" size="sm" className="fb-export" loading={busy} disabled={disabled} onClick={run}>
        <DownloadIcon /> Export
      </Button>
      {error && <span className="field-error">{error}</span>}
    </>
  )
}

const csvCell = (value) => {
  const text = String(value ?? '')
  // A leading = + - @ would be read as a formula by spreadsheet apps.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

function downloadCsv(bookings) {
  const head = ['Booking', 'Date', 'Start', 'End', 'Client', 'Username', 'Service', 'Removal', 'Colour', 'Add-ons', 'Total', 'Paid online', 'Balance due', 'Status', 'Reference']
  const lines = bookings.map((b) => [
    b.id, b.bookingDate, b.startTime.slice(0, 5), b.endTime.slice(0, 5), bookingClientName(b),
    b.client?.username, b.serviceName, b.removalServiceName, b.nailColor,
    b.addOns.map((a) => `${a.name} (${a.handLabel}, ${a.nailCount})`).join('; '),
    b.totalPrice, b.payment?.amountPaid, b.balanceDue, b.status === 'NoShow' ? 'No-show' : b.status, b.payment?.referenceNumber,
  ])
  const csv = '﻿' + [head, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `bookings-${today()}.csv` })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A month of days; days with bookings get a dot (pink while any are still open, gray when all are finished). */
function MonthCalendar({ value, onChange, refresh }) {
  const [month, setMonth] = useState(value.slice(0, 7))
  const [year, monthNumber] = month.split('-').map(Number)
  const counts = useAsync(() => api.admin.bookingCalendar(year, monthNumber), [year, monthNumber, refresh])
  const byDate = Object.fromEntries((counts.data ?? []).map((d) => [d.date, d]))
  const days = Array.from({ length: daysInMonth(year, monthNumber) }, (_, i) => toIsoDate(new Date(year, monthNumber - 1, i + 1)))
  const blanks = new Date(year, monthNumber - 1, 1).getDay()
  const go = (step) => setMonth(toIsoDate(new Date(year, monthNumber - 1 + step, 1)).slice(0, 7))
  const now = today()

  return (
    <section className="fb-card fb-cal" aria-label="Booking calendar">
      <div className="fb-cal-head">
        <button type="button" onClick={() => go(-1)} aria-label="Previous month">‹</button>
        <span aria-live="polite">{new Date(year, monthNumber - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</span>
        <button type="button" onClick={() => go(1)} aria-label="Next month">›</button>
      </div>
      <div className="fb-cal-grid" aria-hidden="true">
        {WEEKDAYS.map((d) => <span key={d} className="fb-cal-wd">{d}</span>)}
      </div>
      <div className="fb-cal-grid" role="radiogroup" aria-label="Day">
        {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`} />)}
        {days.map((d) => {
          const info = byDate[d]
          const label = `${formatDate(d)}${info ? `, ${info.count} booking${info.count === 1 ? '' : 's'}` : ', no bookings'}`
          return (
            <button key={d} type="button" role="radio" aria-checked={d === value} aria-label={label}
              className={`fb-cal-day${d === value ? ' selected' : ''}${d === now ? ' is-today' : ''}`} onClick={() => onChange(d)}>
              {Number(d.slice(8))}
              {info && <i className={info.activeCount ? 'fb-dot' : 'fb-dot is-done'} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div className="fb-cal-legend">
        <span><i className="fb-dot" /> Open bookings</span>
        <span><i className="fb-dot is-done" /> Finished only</span>
        {counts.loading && <Spinner small label="Loading" />}
      </div>
      {counts.error && <Alert kind="error">{errorMessage(counts.error)}</Alert>}
    </section>
  )
}

/** Every booking on one day, by time, with the same actions as the list. Independent of the list's filters. */
function DayBookings({ date, refresh, onChanged }) {
  const day = useAsync(() => api.admin.searchBookings({ date, page: 1, pageSize: 100 }), [date, refresh])
  const items = [...(day.data?.items ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const count = day.data?.totalCount ?? 0
  return (
    <section className="fb-card fb-day" aria-label="Bookings on the chosen day">
      <div className="fb-day-head">
        <h2><CalendarIcon /> Bookings on {new Date(`${date}T00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</h2>
        {day.data && <span className="fb-count">{count} booking{count === 1 ? '' : 's'}</span>}
      </div>
      {day.loading && !day.data && <PageLoader label="Loading the day…" />}
      {day.error && <Alert kind="error">{errorMessage(day.error)}</Alert>}
      {day.data && (
        <AdminBookingTable bookings={items} onChanged={onChanged} dayView
          emptyTitle="No bookings scheduled for this date." emptyText="Pick another day on the calendar." />
      )}
    </section>
  )
}
