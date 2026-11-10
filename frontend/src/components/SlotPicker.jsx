import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks/useAsync'
import { addDays, daysInMonth, toIsoDate, today } from '../lib/dates'
import { formatDate, formatDuration, formatTime } from '../lib/format'
import { errorMessage } from '../api/errors'
import { Alert, Spinner } from './ui'
import { schedule } from '../content/salon'

const STATUS_TEXT = { Open: 'Available', Booked: 'Booked', Break: 'Break', Closed: 'Closed', Past: 'Past', TooShort: 'Not enough time' }

const minutesOf = (time) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
// "2:00 PM" → "2 PM", so the reason fits on one line of a time button.
const shortTime = (text) => text.replace(':00 ', ' ')

/** The few words on a time button that can't be chosen, from the server's exact reason. */
function shortReason(slot) {
  if (slot.status !== 'TooShort') return BUTTON_TEXT[slot.status]
  const next = slot.note?.match(/Too close to the (.+) appointment/)
  if (next) return `Runs into ${shortTime(next[1])}`
  if (slot.note?.startsWith('Runs into a closed time')) return 'Runs into closed'
  return BUTTON_TEXT.TooShort
}
// Fits one line on a time button, so every button stays the same size. The exact reason is in its title and accessible name.
const BUTTON_TEXT = { ...STATUS_TEXT, TooShort: 'Unavailable' }
const STATUS_TITLE = {
  Booked: 'Another appointment is at this time',
  Break: 'The 30-minute break after an appointment',
  Closed: 'Closed by the salon',
  TooShort: 'This service would run past closing time or into another appointment and its 30-minute break.',
}

const SLOT_GROUPS = [
  { name: 'Morning', from: '00:00', to: '12:00' },
  { name: 'Afternoon', from: '12:00', to: '17:00' },
  { name: 'Evening', from: '17:00', to: '24:00' },
]

/** "Taken: 11:30 AM – 1:00 PM (break until 1:30 PM)": the appointments already on the day, times only. */
function TakenTimes({ taken }) {
  if (!taken?.length) return null
  return (
    <p className="slot-taken">
      <span className="slot-taken-label">Taken:</span>
      {taken.map((t) => (
        <span key={t.startTime} className="slot-taken-item">
          {formatTime(t.startTime)} – {formatTime(t.endTime)} <span className="muted">(break until {formatTime(t.breakUntil)})</span>
        </span>
      ))}
    </p>
  )
}

/**
 * Date picker plus that day's start times (Ref 10.1). With a serviceId each time shows when that service would
 * finish, and times where it doesn't fit (past closing, or into another appointment or its 30-minute break) are
 * grayed out like booked, closed and past ones.
 */
export function SlotPicker({ date, onDateChange, selectedTime, onTimeChange, serviceId, removalServiceId, maxDaysAhead = schedule.maxDaysAhead, error, keepTime }) {
  const slots = useAsync(() => (date ? api.catalog.slots(date, serviceId, removalServiceId) : Promise.resolve(null)), [date, serviceId, removalServiceId])
  // Days the salon is closed all day (days off and dates Leyah blocked) are grayed out in the calendar.
  const closedDates = useAsync(() => api.catalog.closedDates().catch(() => []), [])
  const chosen = selectedTime && slots.data?.slots.find((s) => s.startTime === selectedTime)

  return (
    <div className="slot-picker">
      <div className="slot-layout">
      <DateCalendar value={date} maxDaysAhead={maxDaysAhead} error={error} closedDates={closedDates.data ?? []}
        onChange={(value) => {
          onDateChange(value)
          onTimeChange('')
        }} />

      <div className="pick-column">
        <span className="field-label pick-title" id="time-label">Choose a time <span className="required" aria-hidden="true">*</span></span>
        <div className="pick-card" role="group" aria-labelledby="time-label">
          {date && <div className="pick-card-head"><span className="pick-card-title">{longDate(date)}</span></div>}
          {!date && <p className="muted pick-empty">Choose a date to see available times.</p>}
          {date && slots.loading && <div className="inline-loader"><Spinner small /> Loading times…</div>}
          {date && slots.error && <Alert kind="error">{errorMessage(slots.error)}</Alert>}
          {date && slots.data?.isClosed && <p className="muted pick-empty">{slots.data.closedReason}. Please choose another date.</p>}
          {date && slots.data && !slots.data.isClosed && (() => {
            const day = slots.data
            const closing = minutesOf(day.closingTime)
            // With a service chosen, times that would end after closing can never be booked for it, so they aren't shown.
            const visible = serviceId ? day.slots.filter((s) => s.status !== 'TooShort' || minutesOf(s.startTime) + day.durationMinutes <= closing) : day.slots
            const lastOpen = serviceId ? visible.filter((s) => s.status === 'Open').at(-1) : null
            return (
            <>
              {lastOpen && (
                <p className="slot-last-note">
                  {`Your ${removalServiceId ? 'services take' : 'service takes'} ${formatDuration(day.durationMinutes)}. The last time you can start on this day is `}
                  <strong>{formatTime(lastOpen.startTime)}</strong>
                  {minutesOf(lastOpen.startTime) + day.durationMinutes === closing
                    ? `, ending at ${formatTime(day.closingTime)} closing.` : `, ending at ${formatTime(lastOpen.endTime)}.`}
                </p>
              )}
              {serviceId && !lastOpen && <p className="slot-last-note">No times left on this day for {formatDuration(day.durationMinutes)}. Please choose another date.</p>}
              <TakenTimes taken={day.taken} />
              <div className="slot-groups">
                {SLOT_GROUPS.map(({ name, from, to }) => {
                  const group = visible.filter((s) => s.startTime >= from && s.startTime < to)
                  if (!group.length) return null
                  return (
                    <div key={name} role="group" aria-label={name}>
                      <div className="slot-group-title">{name}</div>
                      <div className="slot-grid">
                        {group.map((slot) => {
                          const isCurrent = keepTime && slot.startTime === keepTime
                          const open = slot.status === 'Open'
                          const isLast = slot === lastOpen
                          const selected = selectedTime === slot.startTime
                          const range = `${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}`
                          // The exact reason when there is one ("Break until 1:30 PM", "Too close to the 11:30 AM appointment").
                          const reason = isCurrent ? 'Current' : slot.note ?? STATUS_TEXT[slot.status]
                          return (
                            <button key={slot.startTime} type="button" disabled={!open} aria-label={`${range} ${reason}${isLast ? ', last time today' : ''}`}
                              className={`slot slot-${slot.status.toLowerCase()}${selected ? ' slot-selected' : ''}${isLast ? ' slot-last' : ''}`}
                              aria-pressed={selected} onClick={() => onTimeChange(slot.startTime)}
                              title={open ? `Ends at ${formatTime(slot.endTime)}` : isCurrent ? 'Your current time' : slot.note ?? STATUS_TITLE[slot.status] ?? STATUS_TEXT[slot.status]}>
                              {isLast && <span className="slot-last-tag" aria-hidden="true">Last time</span>}
                              <span className="slot-time">{formatTime(slot.startTime)}</span>
                              {!open && <span className="slot-status">{isCurrent ? 'Current' : shortReason(slot)}</span>}
                              {open && serviceId && <span className="slot-status">Ends {formatTime(slot.endTime)}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="pick-hint">
                Open {formatTime(slots.data.openingTime)} – {formatTime(slots.data.closingTime)}
                {serviceId ? <> · This service takes {formatDuration(slots.data.durationMinutes)}</> : null}
                {` · ${slots.data.bufferMinutes}-minute break after each appointment`}
              </p>
            </>
            )
          })()}
        </div>
      </div>

      <div className={chosen ? 'slot-chosen is-set' : 'slot-chosen'} aria-live="polite">
        <span className="slot-chosen-label">Your appointment</span>
        {date && <span className="slot-chosen-date">{longDate(date)}</span>}
        <span className="slot-chosen-time">
          {chosen ? `${formatTime(chosen.startTime)} – ${formatTime(chosen.endTime)}` : date ? 'Now choose a time' : 'Choose a date and a time'}
        </span>
      </div>
      </div>
    </div>
  )
}

const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ARROW_STEPS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/**
 * A month calendar: every date is in view with no sideways scrolling, and dates that can't be booked are grayed out.
 * Each day is a radio button named by its full date, e.g. "Thu, Nov 5, 2026". Arrow keys move between days and months.
 */
export function DateCalendar({ value, onChange, maxDaysAhead, error, closedDates = [] }) {
  const first = today()
  const last = addDays(first, maxDaysAhead)
  const [month, setMonth] = useState(() => (value && value >= first && value <= last ? value : first).slice(0, 7))
  const gridRef = useRef(null)
  const focusNext = useRef(null)

  // After an arrow key, which may have changed the month, focus lands on the new day.
  useEffect(() => {
    if (!focusNext.current) return
    gridRef.current?.querySelector(`[data-date="${focusNext.current}"]`)?.focus()
    focusNext.current = null
  }, [month, value])

  const [year, monthNumber] = month.split('-').map(Number)
  const days = Array.from({ length: daysInMonth(year, monthNumber) }, (_, i) => toIsoDate(new Date(year, monthNumber - 1, i + 1)))
  const leadingBlanks = new Date(year, monthNumber - 1, 1).getDay()
  const closed = new Set(closedDates)
  const inWindow = (day) => day >= first && day <= last
  const bookable = (day) => inWindow(day) && !closed.has(day)
  const tabStop = days.includes(value) && bookable(value) ? value : days.find(bookable)

  const changeMonth = (step) => setMonth(toIsoDate(new Date(year, monthNumber - 1 + step, 1)).slice(0, 7))

  const onKeyDown = (e) => {
    const step = ARROW_STEPS[e.key]
    const from = e.target.dataset.date
    if (!step || !from) return
    e.preventDefault()
    // Closed days are skipped over, so the arrows always land on a day that can be booked.
    let next = addDays(from, step)
    while (inWindow(next) && closed.has(next)) next = addDays(next, step)
    if (!bookable(next)) return
    focusNext.current = next
    setMonth(next.slice(0, 7))
    onChange(next)
  }

  return (
    <div className={error ? 'pick-column field-invalid' : 'pick-column'}>
      <span className="field-label pick-title" id="book-cal-label">Choose a date <span className="required" aria-hidden="true">*</span></span>
      <div className="pick-card">
        <div className="pick-card-head">
          <button type="button" onClick={() => changeMonth(-1)} disabled={month <= first.slice(0, 7)} aria-label="Previous month">‹</button>
          <span className="pick-card-title" aria-live="polite">
            {new Date(year, monthNumber - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
          </span>
          <button type="button" onClick={() => changeMonth(1)} disabled={month >= last.slice(0, 7)} aria-label="Next month">›</button>
        </div>
        <div className="book-cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="book-cal-days" ref={gridRef} role="radiogroup" aria-labelledby="book-cal-label" onKeyDown={onKeyDown}>
          {Array.from({ length: leadingBlanks }, (_, i) => <span key={i} />)}
          {days.map((day) => (
            <button key={day} type="button" role="radio" aria-checked={day === value}
              aria-label={closed.has(day) && inWindow(day) ? `${formatDate(day)}, closed` : formatDate(day)}
              title={closed.has(day) && inWindow(day) ? 'Closed' : undefined}
              aria-current={day === first ? 'date' : undefined} data-date={day} disabled={!bookable(day)} tabIndex={day === tabStop ? 0 : -1}
              className={`book-cal-day${day === value ? ' selected' : ''}${day === first ? ' is-today' : ''}${closed.has(day) && inWindow(day) ? ' is-closed' : ''}`}
              onClick={() => onChange(day)}>
              {Number(day.slice(8))}
            </button>
          ))}
        </div>
        <p className="pick-hint"><i aria-hidden="true" /> Today · You can book up to {maxDaysAhead} days ahead{closed.size > 0 && ' · Crossed-out days are closed'}</p>
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  )
}
