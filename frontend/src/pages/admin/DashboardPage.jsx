import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { bookingClientName, bookingClientPhone, isWalkIn } from '../../lib/bookingClient'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { addDays, startsAt } from '../../lib/dates'
import { formatDate, formatMoney, formatTime } from '../../lib/format'
import { Alert, Button, PageLoader, STATUS_LABELS } from '../../components/ui'
import { BalanceDialog, NoShowDialog, RefundDialog } from '../../components/BookingDialogs'
import { BookingDetails } from './BookingDetails'
import { colorFor, colorLabel } from '../../lib/shades'
import { apiPhotoSrc } from '../../lib/photos'

/* ---- Small line icons (24px grid, drawn with the current text colour) ---- */
const Icon = ({ children, className = '' }) => (
  <svg className={`dash-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const CalendarIcon = () => <Icon><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1" fill="currentColor" /></Icon>
const CheckCircleIcon = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M8.3 12.2l2.5 2.5 4.9-5.2" /></Icon>
const BellIcon = () => <Icon><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Icon>
const UserIcon = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></Icon>
const ClockIcon = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>
const CardIcon = () => <Icon><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></Icon>
const WalletIcon = () => <Icon><path d="M4 7.5h14.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2H16" /><path d="M16 14h2" /></Icon>
const ChevronIcon = ({ dir = 'right' }) => <Icon className={`dash-chevron dash-chevron-${dir}`}><path d="M9 6l6 6-6 6" /></Icon>

/** A light hand-drawn polish bottle and blossoms for the corner of the Next client card. */
const PolishArt = () => (
  <svg className="dash-art" viewBox="0 0 160 140" aria-hidden="true">
    <g fill="none" stroke="#d9a3b2" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="92" y="14" width="18" height="34" rx="4" transform="rotate(18 101 31)" fill="#f6dde4" />
      <path d="M80 50c-6 14-8 30-4 44 4 12 26 16 38 6 8-7 12-26 8-44-2-8-8-12-16-14l-14-4c-6-1-10 5-12 12z" fill="#f3d0da" />
      <path d="M88 66c-2 10-1 20 2 27" stroke="#fff" strokeWidth="3" />
      {[[38, 104], [62, 122], [130, 112]].map(([cx, cy], i) => (
        <g key={i} transform={`translate(${cx} ${cy})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-9" rx="6.5" ry="9.5" transform={`rotate(${a})`} fill="#fbe8ee" />
          ))}
          <circle r="3" fill="#e8b6c3" />
        </g>
      ))}
    </g>
  </svg>
)

/* ---- Helpers ---- */
const clientName = bookingClientName
const servicesShort = (b) => [b.serviceName, b.removalServiceName && 'Removal'].filter(Boolean).join(' + ')
const servicesInOrder = (b) => (b.removalServiceName ? `Removal (${b.removalServiceName}) first, then ${b.serviceName}` : b.serviceName)
const stonesText = (b) => b.addOns.map((a) => `${a.name} · ${a.handLabel.toLowerCase()}`).join(', ')
const shortDate = (iso) => formatDate(iso).replace(/, \d{4}$/, '')
const monthDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { month: new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short' }).toUpperCase(), day: d }
}

const ColorDot = ({ name }) => {
  const swatch = colorFor(name)
  return <span className={swatch ? 'dash-swatch' : 'dash-swatch dash-swatch-unknown'} style={swatch ? { background: swatch } : undefined} aria-hidden="true" />
}

/** "in 2 hr 15 min", "in 3 days", "Happening now". */
function timeUntil(minutes, endMinutes) {
  if (minutes <= 0) return endMinutes > 0 ? 'Happening now' : 'Finished'
  if (minutes >= 24 * 60) {
    const days = Math.round(minutes / (24 * 60))
    return `in ${days} ${days === 1 ? 'day' : 'days'}`
  }
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `in ${[h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ') || 'less than a minute'}`
}

/** The browser's clock, ticking every 30 seconds so "in 2 hr 15 min" keeps counting down. */
function useTick() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const ATTENTION_SHOWN = 5

/**
 * Leyah's day at a glance: the day's appointments, payments waiting to be confirmed, things that need her, the next
 * client and the next 7 days (Ref 11.1). Money figures and the free-time overview live on Reports and Schedule.
 */
export default function DashboardPage() {
  const [date, setDate] = useState(null) // null = today
  // fetchedAt: when the salon's "now" arrived, so the countdown can move on from it.
  const dashboard = useAsync(async () => ({ ...(await api.admin.dashboard(date)), fetchedAt: Date.now() }), [date])
  const [message, setMessage] = useState(null)
  const tick = useTick()

  if (dashboard.loading && !dashboard.data) return <PageLoader label="Loading dashboard…" />
  if (dashboard.error && !dashboard.data) return <Alert kind="error">{errorMessage(dashboard.error)}</Alert>
  // The defaults keep the page up if an older API without these fields answers (for example during an update).
  const d = { attention: [], nextBooking: null, date: dashboard.data.today, now: new Date().toISOString(), ...dashboard.data }
  const elapsed = Math.max(0, (tick - d.fetchedAt) / 60_000)
  const isToday = d.date === d.today
  // Money still due at the salon for the bookings on this day and the 7 after it.
  const isActive = (b) => b.status === 'Pending' || b.status === 'Confirmed'
  const balanceToCollect = [...d.todaysBookings, ...d.upcomingBookings].filter(isActive).reduce((sum, b) => sum + (b.balanceDue ?? 0), 0)
  const changed = (text) => { setMessage(text); dashboard.reload() }
  const pick = (value) => setDate(value === d.today ? null : value)

  return (
    <div className="dash stack-lg">
      <header className="dash-head">
        <h1>Dashboard</h1>
        <DateStepper date={d.date} onChange={pick} loading={dashboard.loading} />
      </header>

      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {dashboard.error && <Alert kind="error">{errorMessage(dashboard.error)}</Alert>}

      <div className="dash-stats">
        <div className="dash-stat">
          <span className="dash-tile"><CalendarIcon /></span>
          <div>
            <p>{isToday ? 'Today’s appointments' : 'Appointments'}</p>{/* the date picker above shows which day */}
            <strong>{d.todaysBookingCount}</strong>
          </div>
        </div>
        <div className="dash-stat">
          <span className="dash-tile dash-tile-green"><WalletIcon /></span>
          <div>
            <p>Balance to collect <span className="dash-stat-sub">· {isToday ? 'today and the next 7 days' : `${shortDate(d.date)} and the 7 days after`}</span></p>
            <strong>{formatMoney(balanceToCollect)}</strong>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <AttentionCard items={d.attention} onChanged={changed} />
        <NextClientCard booking={d.nextBooking} date={d.date} isToday={isToday} isPast={d.date < d.today}
          now={d.now} elapsed={elapsed} upcoming={d.upcomingBookings} />
      </div>

      {/* This day in full, beside the week ahead. */}
      <div className="dash-grid">
        <DayScheduleCard bookings={d.todaysBookings} date={d.date} isToday={isToday} />
        <UpcomingCard bookings={d.upcomingBookings} from={d.date} isToday={isToday} />
      </div>
    </div>
  )
}

/** Busy-day view: every appointment of the day in time order, finished and cancelled ones included. */
function DayScheduleCard({ bookings: all, date, isToday }) {
  const [open, setOpen] = useState(null)
  // The same appointments the count above counts; cancelled ones are only mentioned, so the two always agree.
  const bookings = all.filter((b) => b.status !== 'Cancelled')
  const cancelled = all.length - bookings.length
  return (
    <section className="card dash-card" aria-labelledby="dash-day">
      <div className="dash-card-head">
        <span className="dash-head-icon"><ClockIcon /></span>
        <h2 id="dash-day">{isToday ? 'Today’s schedule' : `Schedule · ${shortDate(date)}`}</h2>
      </div>
      {bookings.length === 0 ? (
        <p className="dash-quiet">No appointments on this day.</p>
      ) : (
        <ul className="dash-week">
          {bookings.map((b) => (
            <li key={b.id}>
              <button type="button" className="dash-week-row" onClick={() => setOpen(b)}
                aria-label={`${formatTime(b.startTime)} to ${formatTime(b.endTime)}, ${clientName(b)}, ${STATUS_LABELS[b.status] ?? b.status}. View details`}>
                <span className="dash-timeblock">{formatTime(b.startTime)}<small>to {formatTime(b.endTime)}</small></span>
                <span className="dash-week-text">
                  <strong>{clientName(b)}</strong>
                  <span>{servicesInOrder(b)}{b.addOns.length > 0 && ` · ${stonesText(b)}`}</span>
                </span>
                <span className={`dash-status dash-status-${b.status.toLowerCase()}`}>{STATUS_LABELS[b.status] ?? b.status}</span>
                <ChevronIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cancelled > 0 && (
        <p className="dash-quiet dash-cancelled-note">
          {cancelled} cancelled {cancelled === 1 ? 'booking' : 'bookings'} not shown. <Link to={`/admin/bookings?date=${date}&status=Cancelled`}>See {cancelled === 1 ? 'it' : 'them'}</Link>
        </p>
      )}
      {open && <BookingDetails booking={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** ‹ Tue, Nov 10, 2026 › — the middle opens the browser's date picker; the arrows step a day at a time. */
function DateStepper({ date, onChange, loading }) {
  const input = useRef(null)
  return (
    <div className="dash-date-wrap">
      <div className="dash-date" aria-busy={loading}>
        <button type="button" className="dash-date-step" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
          <ChevronIcon dir="left" />
        </button>
        <label className="dash-date-label">
          <CalendarIcon />
          <span>{formatDate(date)}</span>
          <input ref={input} type="date" value={date} aria-label="Show another day"
            onChange={(e) => e.target.value && onChange(e.target.value)}
            onClick={() => { try { input.current?.showPicker?.() } catch { /* older browsers open it themselves */ } }} />
        </label>
        <button type="button" className="dash-date-step" aria-label="Next day" onClick={() => onChange(addDays(date, 1))}>
          <ChevronIcon />
        </button>
      </div>
    </div>
  )
}

const ATTENTION = {
  CheckPayment: { icon: <CardIcon />, tone: 'rose', title: 'Check payment' },
  DatePassed: { icon: <CalendarIcon />, tone: 'blue', title: 'Did they come?' },
  BalanceNotRecorded: { icon: <WalletIcon />, tone: 'amber', title: 'Balance not recorded' },
  RefundDue: { icon: <WalletIcon />, tone: 'rose', title: 'Refund to send' },
  ColorRequest: { icon: <CalendarIcon />, tone: 'amber', title: 'Colour request' },
}

function attentionLine(kind, b) {
  const when = shortDate(b.bookingDate)
  if (kind === 'CheckPayment') {
    const p = b.payment
    return p ? `${when} · ${p.method ?? 'Paid'} ${formatMoney(p.amountPaid)} ${p.optionLabel.toLowerCase().replace(/^booking /, '')}` : `${when} · ${formatTime(b.startTime)}`
  }
  if (kind === 'BalanceNotRecorded') return `${when} · ${formatMoney(b.balanceDue)} still to collect`
  if (kind === 'ColorRequest') return `${when} · "${b.colorRequest}" — do you have this shade?`
  if (kind === 'RefundDue') return `${when} · ${formatMoney(b.payment?.refundDue)} to send back (${b.status === 'NoShow' ? 'no-show' : 'cancelled'})`
  return `${when} · date passed, still ${(STATUS_LABELS[b.status] ?? b.status).toLowerCase()}`
}

function AttentionCard({ items, onChanged }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null)
  const shown = items.slice(0, ATTENTION_SHOWN)

  const quick = async (b, action, text) => {
    setBusyId(b.id)
    setError(null)
    try {
      await api.admin[action](b.id)
      onChanged(text)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }
  const closeAnd = (text) => { setDialog(null); onChanged(text) }
  const answerColor = async (b, available) => {
    setBusyId(b.id)
    setError(null)
    try {
      await api.admin.decideColorRequest(b.id, available)
      onChanged(available ? `Colour request for booking #${b.id} confirmed.` : `Booking #${b.id}: colour marked as not available.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card dash-card" aria-labelledby="dash-attention">
      <div className="dash-card-head">
        <span className="dash-head-icon"><BellIcon /></span>
        <h2 id="dash-attention">Needs your attention</h2>
        {items.length > 0 && <span className="dash-chip">{items.length} {items.length === 1 ? 'item' : 'items'}</span>}
      </div>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      {items.length === 0 ? (
        <div className="dash-empty">
          <span className="dash-tile dash-tile-green"><CheckCircleIcon /></span>
          <div><strong>All caught up</strong><p>No payments to check and nothing left open.</p></div>
        </div>
      ) : (
        <ul className="dash-attn-list">
          {shown.map(({ kind, booking: b }) => {
            const look = ATTENTION[kind] ?? ATTENTION.CheckPayment
            const title = `${look.title} · ${clientName(b)}`
            return (
              <li key={`${kind}-${b.id}`} className="dash-attn">
                <span className={`dash-tile dash-tile-${look.tone}`}>{look.icon}</span>
                <button type="button" className="dash-attn-text" onClick={() => setDialog({ kind: 'details', booking: b })}
                  aria-label={`${title}, booking #${b.id}. View details`}>
                  <strong>{title}</strong>
                  <span>{attentionLine(kind, b)}</span>
                </button>
                <div className="dash-attn-actions">
                  {kind === 'CheckPayment' && (
                    <Button size="sm" loading={busyId === b.id} onClick={() => quick(b, 'confirm', `Booking #${b.id} confirmed.`)}>Confirm</Button>
                  )}
                  {kind === 'DatePassed' && b.status === 'Confirmed' && (
                    <Button size="sm" loading={busyId === b.id}
                      onClick={() => (b.balanceDue > 0 ? setDialog({ kind: 'complete', booking: b }) : quick(b, 'complete', `Booking #${b.id} marked as completed.`))}>
                      Complete
                    </Button>
                  )}
                  {kind === 'DatePassed' && (
                    <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'no-show', booking: b })}>No-show</Button>
                  )}
                  {kind === 'ColorRequest' && (
                    <>
                      <Button size="sm" loading={busyId === b.id} onClick={() => answerColor(b, true)}>I have it</Button>
                      <Button size="sm" variant="secondary" onClick={() => answerColor(b, false)}>Not available</Button>
                    </>
                  )}
                  {kind === 'RefundDue' && (
                    <Button size="sm" onClick={() => setDialog({ kind: 'refund', booking: b })}>Record</Button>
                  )}
                  {kind === 'BalanceNotRecorded' && (
                    <Button size="sm" onClick={() => setDialog({ kind: 'balance', booking: b })}>Record</Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > ATTENTION_SHOWN && (
        <Link to="/admin/bookings" className="card-link dash-more">{items.length - ATTENTION_SHOWN} more in Bookings →</Link>
      )}

      {dialog?.kind === 'details' && <BookingDetails booking={dialog.booking} onClose={() => setDialog(null)} onChanged={() => onChanged(null)} />}
      {dialog?.kind === 'complete' && (
        <BalanceDialog booking={dialog.booking} completing onClose={() => setDialog(null)}
          onSubmit={async ({ received, reference }) => {
            await api.admin.complete(dialog.booking.id, { balanceReceived: received, balanceReference: received ? reference : null })
            closeAnd(`Booking #${dialog.booking.id} marked as completed${received ? ', balance received' : ''}.`)
          }} />
      )}
      {dialog?.kind === 'balance' && (
        <BalanceDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async ({ reference }) => {
            await api.admin.recordBalance(dialog.booking.id, { balanceReference: reference })
            closeAnd(`Balance recorded for booking #${dialog.booking.id}.`)
          }} />
      )}
      {dialog?.kind === 'refund' && (
        <RefundDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await api.admin.recordRefund(dialog.booking.id, body)
            closeAnd(`Refund recorded for booking #${dialog.booking.id}.`)
          }} />
      )}
      {dialog?.kind === 'no-show' && (
        <NoShowDialog booking={dialog.booking} onClose={() => setDialog(null)}
          onSubmit={async () => {
            await api.admin.markNoShow(dialog.booking.id)
            closeAnd(`Booking #${dialog.booking.id} marked as a no-show.`)
          }} />
      )}
    </section>
  )
}

function NextClientCard({ booking: b, date, isToday, isPast, now, elapsed, upcoming }) {
  const [details, setDetails] = useState(false)
  let chip = null
  if (b) {
    const nowMs = new Date(now).getTime() + elapsed * 60_000
    const start = (startsAt(b.bookingDate, b.startTime).getTime() - nowMs) / 60_000
    const end = (startsAt(b.bookingDate, b.endTime).getTime() - nowMs) / 60_000
    chip = timeUntil(start, end)
  }
  const later = upcoming[0]
  const emptyText = isPast ? 'This day has passed.' : isToday ? 'No more appointments today.' : 'No appointments on this day.'

  return (
    <section className={b ? 'card dash-card dash-next' : 'card dash-card dash-next is-empty'} aria-labelledby="dash-next">
      <div className="dash-card-head">
        <span className="dash-head-icon"><UserIcon /></span>
        <h2 id="dash-next">{isToday ? 'Next client' : `First client · ${shortDate(date)}`}</h2>
        {chip && <span className="dash-chip">{chip}</span>}
      </div>

      {b ? (
        <>
          <button type="button" className="dash-next-time" onClick={() => setDetails(true)} aria-label={`${formatTime(b.startTime)} to ${formatTime(b.endTime)}. View booking #${b.id}`}>
            <span className="dash-tile dash-tile-sm"><ClockIcon /></span>
            <span>{formatTime(b.startTime)} – {formatTime(b.endTime)}</span>
          </button>
          <dl className="dash-next-details">
            <dt>Client</dt>
            <dd>{!isWalkIn(b) && apiPhotoSrc(b.client?.photoUrl, b.client?.photoDataUrl) && <img className="dash-client-photo" src={apiPhotoSrc(b.client?.photoUrl, b.client?.photoDataUrl)} alt="" />}{clientName(b)}{bookingClientPhone(b) && <> · <a href={`tel:${bookingClientPhone(b)}`}>{bookingClientPhone(b)}</a></>}{isWalkIn(b) && <span className="muted"> · walk-in</span>}</dd>
            <dt>Services</dt>
            <dd>{servicesInOrder(b)}</dd>
            {b.nailColor && (<><dt>Colour</dt><dd><ColorDot name={b.nailColor} /> {colorLabel(b.nailColor)}</dd></>)}
            {b.addOns.length > 0 && (<><dt>Stones</dt><dd>{stonesText(b)}</dd></>)}
            {b.note && (<><dt>Note</dt><dd className="dash-note">{b.note}</dd></>)}
          </dl>
          <PolishArt />
        </>
      ) : (
        <div className="dash-empty">
          <PolishArt />
          <div>
            <strong>{emptyText}</strong>
            {later && !isPast && <p>Next: {shortDate(later.bookingDate)} · {formatTime(later.startTime)} · {clientName(later)}</p>}
          </div>
        </div>
      )}
      {details && b && <BookingDetails booking={b} onClose={() => setDetails(false)} />}
    </section>
  )
}

function UpcomingCard({ bookings, from, isToday }) {
  const [open, setOpen] = useState(null)
  return (
    <section className="card dash-card" aria-labelledby="dash-upcoming">
      <div className="dash-card-head">
        <span className="dash-head-icon"><CalendarIcon /></span>
        <h2 id="dash-upcoming">{isToday ? 'Next 7 days' : `7 days after ${shortDate(from)}`}</h2>
        <Link to="/admin/bookings" className="card-link dash-head-link">All bookings →</Link>
      </div>
      {bookings.length === 0 ? (
        <p className="dash-quiet">Nothing booked in these 7 days.</p>
      ) : (
        <ul className="dash-week">
          {bookings.map((b) => {
            const md = monthDay(b.bookingDate)
            return (
              <li key={b.id}>
                <button type="button" className="dash-week-row" onClick={() => setOpen(b)}
                  aria-label={`${formatDate(b.bookingDate)} at ${formatTime(b.startTime)}, ${clientName(b)}, ${STATUS_LABELS[b.status] ?? b.status}. View details`}>
                  <span className="dash-dateblock"><small>{md.month}</small>{md.day}</span>
                  <span className="dash-week-text">
                    <strong>{shortDate(b.bookingDate)} · {formatTime(b.startTime)}</strong>
                    <span>{clientName(b)} · {servicesShort(b)}</span>
                  </span>
                  <span className={`dash-status dash-status-${b.status.toLowerCase()}`}>{STATUS_LABELS[b.status] ?? b.status}</span>
                  <ChevronIcon />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open && <BookingDetails booking={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
