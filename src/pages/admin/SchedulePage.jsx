import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { addDays, daysInMonth, today, toIsoDate } from '../../lib/dates'
import { formatDate, formatTime } from '../../lib/format'
import { LIMITS } from '../../validation/rules'
import { Alert, Button, Card, PageHeader, PageLoader, Spinner, StatusBadge, TextField } from '../../components/ui'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Calendar for blocking days off, holidays or single slots (Ref 11.4). */
export default function SchedulePage() {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })
  const [selected, setSelected] = useState(today())
  const [message, setMessage] = useState(null)

  const first = toIsoDate(new Date(month.year, month.month - 1, 1))
  const last = toIsoDate(new Date(month.year, month.month - 1, daysInMonth(month.year, month.month)))
  const blocks = useAsync(() => api.admin.blockedSlots(first, last), [first, last])

  const shift = (delta) => setMonth(({ year, month: m }) => {
    const date = new Date(year, m - 1 + delta, 1)
    return { year: date.getFullYear(), month: date.getMonth() + 1 }
  })

  const changed = (text) => {
    setMessage(text)
    blocks.reload()
  }

  return (
    <div className="stack">
      <PageHeader title="Schedule" subtitle="Block days off, holidays or single time slots. Blocked times cannot be booked." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <div className="schedule-layout">
        <Card>
          <div className="calendar-head">
            <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous month">‹</Button>
            <h2>{new Date(month.year, month.month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</h2>
            <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next month">›</Button>
          </div>
          {blocks.error && <Alert kind="error">{errorMessage(blocks.error)}</Alert>}
          <Calendar year={month.year} month={month.month} blocks={blocks.data ?? []} selected={selected} onSelect={setSelected} />
          {blocks.loading && <div className="inline-loader"><Spinner small /> Loading…</div>}
        </Card>
        <DayPanel key={selected} date={selected} blocks={(blocks.data ?? []).filter((b) => b.date === selected)} onChanged={changed} />
      </div>
    </div>
  )
}

function Calendar({ year, month, blocks, selected, onSelect }) {
  const offset = new Date(year, month - 1, 1).getDay()
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => toIsoDate(new Date(year, month - 1, i + 1)))
  const todayIso = today()
  return (
    <div className="calendar" role="grid" aria-label="Choose a date">
      {WEEKDAYS.map((d) => <div key={d} className="calendar-weekday" role="columnheader">{d}</div>)}
      {Array.from({ length: offset }, (_, i) => <div key={`pad-${i}`} />)}
      {days.map((date) => {
        const dayBlocks = blocks.filter((b) => b.date === date)
        const wholeDay = dayBlocks.some((b) => b.isWholeDay)
        const classes = ['calendar-day', date === selected && 'selected', date === todayIso && 'today', date < todayIso && 'past',
          wholeDay && 'blocked', !wholeDay && dayBlocks.length > 0 && 'partly-blocked'].filter(Boolean).join(' ')
        return (
          <button key={date} type="button" role="gridcell" className={classes} aria-selected={date === selected} onClick={() => onSelect(date)}
            aria-label={`${formatDate(date)}${wholeDay ? ', blocked' : dayBlocks.length ? `, ${dayBlocks.length} slot(s) blocked` : ''}`}>
            <span>{Number(date.slice(8))}</span>
            {(wholeDay || dayBlocks.length > 0) && <i className="calendar-dot" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

function DayPanel({ date, blocks, onChanged }) {
  const slots = useAsync(() => api.catalog.slots(date), [date, blocks.length])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const isPast = date < today()
  const wholeDayBlock = blocks.find((b) => b.isWholeDay)

  const run = async (key, action, text) => {
    setBusy(key)
    setError(null)
    try {
      await action()
      setReason('')
      onChanged(text)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const block = (startTime) => run(startTime ?? 'day', () => api.admin.blockSlot({ date, startTime, reason: reason.trim() || null }),
    startTime ? `${formatTime(startTime)} on ${formatDate(date)} blocked.` : `${formatDate(date)} blocked.`)

  return (
    <Card title={formatDate(date)}>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {isPast && <p className="muted">Past dates cannot be changed.</p>}

      {blocks.length > 0 && (
        <ul className="block-list">
          {blocks.map((b) => (
            <li key={b.id}>
              <span>
                <strong>{b.isWholeDay ? 'Whole day' : formatTime(b.startTime)}</strong>
                {b.reason && <span className="muted"> — {b.reason}</span>}
              </span>
              {!isPast && (
                <Button variant="ghost" size="sm" loading={busy === `un-${b.id}`}
                  onClick={() => run(`un-${b.id}`, () => api.admin.unblockSlot(b.id), 'Block removed.')}>Unblock</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isPast && !wholeDayBlock && (
        <div className="stack">
          <TextField label="Reason (optional)" placeholder="e.g. Day off, holiday" maxLength={LIMITS.blockReasonMax} value={reason}
            onChange={(e) => setReason(e.target.value)} />
          <Button variant="secondary" loading={busy === 'day'} onClick={() => block(null)}>Block the whole day</Button>
          <h3>Time slots</h3>
          {slots.loading && <PageLoader />}
          {slots.data && (
            <ul className="slot-admin-list">
              {slots.data.slots.map((slot) => (
                <li key={slot.startTime}>
                  <span>{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</span>
                  <span className="row">
                    {slot.status === 'Booked' ? <StatusBadge status="Confirmed" /> : <span className={`slot-tag slot-tag-${slot.status.toLowerCase()}`}>{slot.status}</span>}
                    {slot.status === 'Open' && (
                      <Button variant="ghost" size="sm" loading={busy === slot.startTime} onClick={() => block(slot.startTime)}>Block</Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Slots that are already booked must be rescheduled or cancelled before they can be blocked.</p>
        </div>
      )}
      {date > addDays(today(), 60) && <p className="muted small">Clients can only book up to 60 days ahead.</p>}
    </Card>
  )
}
