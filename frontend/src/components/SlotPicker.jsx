import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks/useAsync'
import { addDays, today } from '../lib/dates'
import { formatDate, formatDuration, formatTime } from '../lib/format'
import { errorMessage } from '../api/errors'
import { Alert, Spinner } from './ui'

const STATUS_TEXT = { Open: 'Available', Booked: 'Booked', Closed: 'Closed', Past: 'Past', TooShort: 'Not enough time' }
const STATUS_TITLE = { Closed: 'Closed by the salon', TooShort: 'This service would run past closing time or into another appointment and its 30-minute break.' }

/**
 * Date picker plus that day's start times (Ref 10.1). With a serviceId each time shows when that service would
 * finish, and times where it doesn't fit (past closing, or into another appointment or its 30-minute break) are
 * grayed out like booked, closed and past ones.
 */
export function SlotPicker({ date, onDateChange, selectedTime, onTimeChange, serviceId, maxDaysAhead = 60, error, keepTime }) {
  const slots = useAsync(() => (date ? api.catalog.slots(date, serviceId) : Promise.resolve(null)), [date, serviceId])

  return (
    <div className="slot-picker">
      <DateStrip value={date} maxDaysAhead={maxDaysAhead} error={error}
        onChange={(value) => {
          onDateChange(value)
          onTimeChange('')
        }} />

      {!date && <p className="muted">Choose a date to see available times.</p>}
      {date && slots.loading && <div className="inline-loader"><Spinner small /> Loading times…</div>}
      {date && slots.error && <Alert kind="error">{errorMessage(slots.error)}</Alert>}
      {date && slots.data && (
        <fieldset className="slot-fieldset">
          <legend>Time {slots.data.isClosed && <span className="muted">— {slots.data.closedReason}</span>}</legend>
          {!slots.data.isClosed && (
            <p className="muted small slot-hours">
              Open {formatTime(slots.data.openingTime)} – {formatTime(slots.data.closingTime)}
              {serviceId ? <> · this service takes {formatDuration(slots.data.durationMinutes)}</> : null}
              {` · each appointment is followed by a ${slots.data.bufferMinutes}-minute break`}
            </p>
          )}
          <div className="slot-grid">
            {slots.data.slots.map((slot) => {
              const isCurrent = keepTime && slot.startTime === keepTime
              const open = slot.status === 'Open'
              const selected = selectedTime === slot.startTime
              return (
                <button key={slot.startTime} type="button" disabled={!open}
                  className={`slot slot-${slot.status.toLowerCase()}${selected ? ' slot-selected' : ''}`}
                  aria-pressed={selected} onClick={() => onTimeChange(slot.startTime)}
                  title={open ? undefined : isCurrent ? 'Your current time' : STATUS_TITLE[slot.status] ?? STATUS_TEXT[slot.status]}>
                  <span className="slot-time">{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</span>
                  <span className="slot-status">{isCurrent ? 'Current' : STATUS_TEXT[slot.status]}</span>
                </button>
              )
            })}
          </div>
          <div className="slot-legend" aria-hidden="true">
            <span><i className="legend legend-open" /> Available</span>
            <span><i className="legend legend-booked" /> Booked</span>
            <span><i className="legend legend-closed" /> Closed</span>
          </div>
        </fieldset>
      )}
    </div>
  )
}

const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const monthLabel = (iso) => parse(iso).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

/**
 * The next days as a row of cards (Today, Tomorrow, then weekday and date), scrolled with the arrows or by swiping.
 * The month above follows the cards in view. Each card is a radio button named by its full date, e.g. "Thu, Nov 5, 2026".
 */
function DateStrip({ value, onChange, maxDaysAhead, error }) {
  const first = today()
  const days = useMemo(() => Array.from({ length: maxDaysAhead + 1 }, (_, i) => addDays(first, i)), [first, maxDaysAhead])
  const stripRef = useRef(null)
  const [shownMonth, setShownMonth] = useState(() => monthLabel(value && value >= first ? value : first))
  const [edges, setEdges] = useState({ start: true, end: false })

  // Keeps the month label and arrow buttons in step with the scroll position.
  const sync = () => {
    const strip = stripRef.current
    if (!strip) return
    const firstVisible = [...strip.children].find((card) => card.offsetLeft + card.offsetWidth / 2 >= strip.scrollLeft)
    if (firstVisible) setShownMonth(monthLabel(firstVisible.dataset.date))
    setEdges({ start: strip.scrollLeft <= 2, end: strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2 })
  }

  // A chosen date (a restored draft, or the booking being rescheduled) is brought into view.
  useEffect(() => {
    const strip = stripRef.current
    const card = value && strip?.querySelector(`[data-date="${value}"]`)
    if (card) strip.scrollLeft = card.offsetLeft - strip.clientWidth / 2 + card.offsetWidth / 2
    sync()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const page = (direction) => stripRef.current?.scrollBy({ left: direction * stripRef.current.clientWidth * 0.85, behavior: 'smooth' })

  return (
    <div className={error ? 'date-strip-field field-invalid' : 'date-strip-field'}>
      <div className="date-strip-head">
        <span className="field-label" id="date-strip-label">Date <span className="required" aria-hidden="true">*</span></span>
        <span className="date-strip-month" aria-hidden="true">{shownMonth}</span>
        <span className="date-strip-arrows">
          <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label="Earlier dates">‹</button>
          <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label="Later dates">›</button>
        </span>
      </div>
      <div className="date-strip" ref={stripRef} onScroll={sync} role="radiogroup" aria-labelledby="date-strip-label">
        {days.map((day, i) => {
          const date = parse(day)
          const selected = day === value
          const top = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-PH', { weekday: 'short' })
          return (
            <button key={day} type="button" role="radio" aria-checked={selected} aria-label={formatDate(day)} data-date={day}
              className={`date-card${selected ? ' selected' : ''}${date.getDay() === 0 || date.getDay() === 6 ? ' weekend' : ''}`}
              onClick={() => onChange(day)}>
              <span className="date-card-day">{top}</span>
              <span className="date-card-num">{date.getDate()}</span>
              <span className="date-card-month">{date.toLocaleDateString('en-PH', { month: 'short' })}</span>
            </button>
          )
        })}
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  )
}
