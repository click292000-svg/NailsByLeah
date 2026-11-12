import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { addDays, addMinutesToTime, daysInMonth, today, toIsoDate } from '../../lib/dates'
import { formatDate, formatTime } from '../../lib/format'
import { LIMITS } from '../../validation/rules'
import { schedule } from '../../content/salon'
import { TimeSelect } from '../../components/TimeSelect'
import { Alert, Button, Card, PageHeader, PageLoader, SelectField, Spinner, TextField } from '../../components/ui'
import { BookingRulesCard } from './BookingRulesCards'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Opening hours, plus a calendar for closing days off, holidays, breaks or single times (Ref 11.4). */
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

  // Bumped when the closing time changes, so the day's times are loaded again.
  const [hoursVersion, setHoursVersion] = useState(0)

  // Without text (a click on a time tile) the tile shows the change itself, so no banner pushes the page down.
  const changed = (text) => {
    if (text) setMessage(text)
    blocks.reload()
  }

  const hoursSaved = (text) => {
    changed(text)
    setHoursVersion((v) => v + 1)
  }

  return (
    <div className="stack">
      <PageHeader title="Schedule" subtitle="Set the closing time and close days off, holidays, breaks or single times. Closed times cannot be booked." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      <OpeningHoursCard onSaved={hoursSaved} />
      <BookingRulesCard />
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
        <DayPanel key={`${selected}-${hoursVersion}`} date={selected} blocks={(blocks.data ?? []).filter((b) => b.date === selected)} onChanged={changed} />
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
            aria-label={`${formatDate(date)}${wholeDay ? ', closed' : dayBlocks.length ? `, ${dayBlocks.length} closed period(s)` : ''}`}>
            <span>{Number(date.slice(8))}</span>
            {(wholeDay || dayBlocks.length > 0) && <i className="calendar-dot" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

/** Every half hour from opening + 1 hour to 11:30 PM: the closing times the backend accepts. */
function closingOptions(openingTime) {
  const options = []
  for (let time = addMinutesToTime(openingTime, 60); time !== '00:00:00'; time = addMinutesToTime(time, 30))
    options.push({ value: time, label: formatTime(time) })
  return options
}

/** The opening time is fixed at 11:00 AM; the closing time is Leyah's to set. */
function OpeningHoursCard({ onSaved }) {
  const hours = useAsync(() => api.admin.salonHours(), [])
  const [closing, setClosing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (hours.loading && !hours.data) return <Card title="Opening hours"><PageLoader /></Card>
  if (hours.error) return <Card title="Opening hours"><Alert kind="error">{errorMessage(hours.error)}</Alert></Card>

  const { openingTime, closingTime, bufferMinutes } = hours.data
  const chosen = closing ?? closingTime

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await api.admin.updateSalonHours({ closingTime: chosen })
      hours.setData(updated)
      setClosing(null)
      onSaved(`Closing time set to ${formatTime(updated.closingTime)}.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Opening hours">
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <form className="hours-form" onSubmit={save}>
        <div className="field">
          <div className="field-top"><span className="field-label">Opening time</span></div>
          <div className="input input-readonly">{formatTime(openingTime)}</div>
        </div>
        <TimeSelect label="Closing time" value={chosen} onChange={setClosing} options={closingOptions(openingTime)} />
        <Button type="submit" loading={saving} disabled={chosen === closingTime}>Save closing time</Button>
      </form>
      <p className="muted small">
        Appointments start from {formatTime(openingTime)} and must be finished by the closing time. Each appointment is followed
        by a {bufferMinutes}-minute break before the next one. Booked appointments are never cut short: move them before closing earlier.
      </p>
    </Card>
  )
}

const TAG_TEXT = { Open: 'Open', Booked: 'Booked', Break: 'Break', Closed: 'Closed', Past: 'Past', TooShort: 'Short gap' }

/**
 * Changes a closed time in place: its times (not for a whole day) and its reason. The server checks it again like a
 * new one, so it can't be moved onto a booking or another closed time; the error then shows above.
 */
function EditBlock({ block, starts, closingTime, saving, onSave, onCancel }) {
  const [from, setFrom] = useState(block.startTime ?? '')
  const [to, setTo] = useState(block.endTime ?? (block.startTime ? addMinutesToTime(block.startTime, 30) : ''))
  const [reason, setReason] = useState(block.reason ?? '')
  const fromOptions = starts.map((t) => ({ value: t, label: formatTime(t) }))
  const toOptions = [...starts, closingTime].filter((t) => t && from && t > from).map((t) => ({ value: t, label: formatTime(t) }))
  const submit = (e) => {
    e.preventDefault()
    onSave(block.isWholeDay ? { startTime: null, endTime: null, reason: reason.trim() || null } : { startTime: from, endTime: to, reason: reason.trim() || null })
  }
  return (
    <form className="stack block-edit-form" onSubmit={submit} aria-label="Change closed time">
      {!block.isWholeDay && (
        <div className="block-period">
          <SelectField label="Close from" value={from} options={fromOptions} onChange={(e) => { setFrom(e.target.value); setTo('') }} />
          <SelectField label="Until" value={to} placeholder="End" options={toOptions} disabled={!from} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}
      <TextField label="Reason (optional)" maxLength={LIMITS.blockReasonMax} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="row">
        <Button type="submit" size="sm" loading={saving} disabled={!block.isWholeDay && (!from || !to)}>Save</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  )
}

/** "12 open · 3 booked · 1 break · 1 closed" for the day, so the grid can be read at a glance. */
function TimeCounts({ slots }) {
  const count = (...statuses) => slots.filter((s) => statuses.includes(s.status)).length
  const parts = [[count('Open', 'TooShort'), 'open'], [count('Booked'), 'booked'], [count('Break'), 'break'], [count('Closed'), 'closed']].filter(([n]) => n > 0)
  return <span className="muted small">{parts.map(([n, word]) => `${n} ${word}`).join(' · ')}</span>
}

function DayPanel({ date, blocks, onChanged }) {
  // Reloaded whenever the day's closed times change, including an edited one (same count, new times).
  const blocksKey = JSON.stringify(blocks.map((b) => [b.id, b.startTime, b.endTime]))
  const slots = useAsync(() => api.catalog.slots(date), [date, blocksKey])
  const [editing, setEditing] = useState(null) // id of the closed time being changed
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [announcement, setAnnouncement] = useState('') // read out by screen readers after a tile click
  const isPast = date < today()
  const wholeDayBlock = blocks.find((b) => b.isWholeDay)

  const run = async (key, action, text, { quiet = false } = {}) => {
    setBusy(key)
    setError(null)
    try {
      await action()
      setReason('')
      setFrom('')
      setTo('')
      if (quiet) setAnnouncement(text)
      onChanged(quiet ? null : text)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const span = (startTime, endTime) => `${formatTime(startTime)} – ${formatTime(endTime)}`
  const block = (startTime, endTime, options) => run(startTime ? `${startTime}-${endTime ?? ''}` : 'day',
    () => api.admin.blockSlot({ date, startTime, endTime, reason: reason.trim() || null }),
    startTime ? `${span(startTime, endTime ?? addMinutesToTime(startTime, 30))} on ${formatDate(date)} closed.` : `${formatDate(date)} closed.`, options)

  const save = (b, changes) => run(`edit-${b.id}`, async () => {
    await api.admin.updateBlockedSlot(b.id, { date, ...changes })
    setEditing(null)
  }, b.isWholeDay ? `${formatDate(date)}: reason saved.` : `Closed time changed to ${span(changes.startTime, changes.endTime)}.`)

  const reopen = (b, options) => run(`un-${b.id}`, () => api.admin.unblockSlot(b.id),
    b.isWholeDay ? `${formatDate(date)} reopened.` : `${span(b.startTime, b.endTime ?? addMinutesToTime(b.startTime, 30))} reopened.`, options)
  // The closed period a time falls in, so Closed times can be reopened from the list.
  const closedPeriodAt = (time) => blocks.find((b) => !b.isWholeDay && b.startTime <= time && time < (b.endTime ?? addMinutesToTime(b.startTime, 30)))

  // Periods start on any listed time and end on a later one, up to the closing time.
  const starts = slots.data?.slots.map((s) => s.startTime) ?? []
  const fromOptions = starts.map((t) => ({ value: t, label: formatTime(t) }))
  const toOptions = [...starts, slots.data?.closingTime].filter((t) => t && from && t > from).map((t) => ({ value: t, label: formatTime(t) }))

  return (
    <Card title={formatDate(date)}>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {isPast && <p className="muted">Past dates cannot be changed.</p>}

      {/* The time grid comes first, so closing a time never moves the tiles being clicked. */}
      {!isPast && !wholeDayBlock && (
        <div className="stack">
          <div className="times-head">
            <h3>Times</h3>
            {slots.data && <TimeCounts slots={slots.data.slots} />}
          </div>
          {slots.loading && !slots.data && <PageLoader />}
          <p className="sr-only" aria-live="polite">{announcement}</p>
          {slots.data && (
            <div className="time-grid" role="group" aria-label="Times">
              {slots.data.slots.map((slot) => {
                const open = slot.status === 'Open' || slot.status === 'TooShort'
                const period = slot.status === 'Closed' ? closedPeriodAt(slot.startTime) : null
                const longPeriod = period && (period.endTime ?? addMinutesToTime(period.startTime, 30)) !== addMinutesToTime(period.startTime, 30)
                const label = TAG_TEXT[slot.status] ?? slot.status
                // Booked and past times can't be changed: an appointment's time is never opened up for someone else.
                const action = open ? () => block(slot.startTime, undefined, { quiet: true }) : period ? () => reopen(period, { quiet: true }) : null
                const hint = open ? 'Click to close' : period ? (longPeriod ? `Click to reopen ${span(period.startTime, period.endTime)}` : 'Click to reopen') : slot.note ?? label
                const working = busy === `${slot.startTime}-` || (period && busy === `un-${period.id}`)
                return (
                  <button key={slot.startTime} type="button" disabled={!action || Boolean(busy)} onClick={action ?? undefined}
                    className={`time-tile time-tile-${slot.status.toLowerCase()}${working ? ' is-working' : ''}`}
                    title={hint} aria-label={`${formatTime(slot.startTime)}, ${label}. ${action ? hint : 'Cannot be changed'}`}>
                    <span className="time-tile-time">{formatTime(slot.startTime)}</span>
                    <span className="time-tile-status">{working ? 'Saving…' : label}</span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="muted small">
            Click an <strong>open</strong> time to close it, or a <strong>closed</strong> time to reopen it. <strong>Booked</strong> and
            the 30-minute <strong>break</strong> after each appointment can't be closed; move or cancel the booking first.
          </p>
        </div>
      )}

      {blocks.length > 0 && (
        <div className="stack day-closures">
          <h3>Closed on this day</h3>
          <ul className="block-list">
            {blocks.map((b) => (editing === b.id ? (
              <li key={b.id} className="block-edit">
                <EditBlock block={b} starts={starts} closingTime={slots.data?.closingTime} saving={busy === `edit-${b.id}`}
                  onSave={(changes) => save(b, changes)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={b.id}>
                <span>
                  <strong>{b.isWholeDay ? 'Whole day' : b.endTime ? span(b.startTime, b.endTime) : formatTime(b.startTime)}</strong>
                  {b.reason && <span className="muted"> — {b.reason}</span>}
                </span>
                {!isPast && (
                  <span className="block-actions">
                    <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => { setError(null); setEditing(b.id) }}
                      aria-label={`Change ${b.isWholeDay ? 'whole day' : span(b.startTime, b.endTime ?? addMinutesToTime(b.startTime, 30))}`}>Change</Button>
                    <Button variant="ghost" size="sm" loading={busy === `un-${b.id}`}
                      onClick={() => reopen(b)}>Reopen</Button>
                  </span>
                )}
              </li>
            )))}
          </ul>
        </div>
      )}

      {!isPast && !wholeDayBlock && (
        <div className="stack day-close-forms">
          <h3>Close a longer time</h3>
          <TextField label="Reason (optional)" placeholder="e.g. Break, day off, holiday" maxLength={LIMITS.blockReasonMax} value={reason}
            onChange={(e) => setReason(e.target.value)} />
          <div className="block-period">
            <SelectField label="Close from" value={from} placeholder="Start" options={fromOptions}
              onChange={(e) => { setFrom(e.target.value); setTo('') }} />
            <SelectField label="Until" value={to} placeholder="End" options={toOptions} disabled={!from}
              onChange={(e) => setTo(e.target.value)} />
            <Button variant="secondary" disabled={!from || !to} loading={busy === `${from}-${to}`} onClick={() => block(from, to)}>
              Close period
            </Button>
          </div>
          <Button variant="secondary" loading={busy === 'day'} onClick={() => block(null)}>Close the whole day</Button>
        </div>
      )}
      {date > addDays(today(), schedule.maxDaysAhead) && <p className="muted small">Clients can only book up to {schedule.maxDaysAhead} days ahead.</p>}
    </Card>
  )
}
