import { api } from '../api'
import { useAsync } from '../hooks/useAsync'
import { addDays, today } from '../lib/dates'
import { formatTime } from '../lib/format'
import { errorMessage } from '../api/errors'
import { Alert, Field, Spinner } from './ui'

const STATUS_TEXT = { Open: 'Available', Booked: 'Booked', Blocked: 'Unavailable', Past: 'Past' }

/**
 * Date picker plus that day's time slots. Booked, blocked and past slots are grayed out
 * and cannot be selected (Ref 10.1).
 */
export function SlotPicker({ date, onDateChange, selectedTime, onTimeChange, maxDaysAhead = 60, error, keepTime }) {
  const slots = useAsync(() => (date ? api.catalog.slots(date) : Promise.resolve(null)), [date])

  return (
    <div className="slot-picker">
      <Field label="Date" error={error} required>
        {(aria) => (
          <input className="input" type="date" value={date} min={today()} max={addDays(today(), maxDaysAhead)} required
            onChange={(e) => {
              onDateChange(e.target.value)
              onTimeChange('')
            }} {...aria} />
        )}
      </Field>

      {!date && <p className="muted">Choose a date to see available times.</p>}
      {date && slots.loading && <div className="inline-loader"><Spinner small /> Loading times…</div>}
      {date && slots.error && <Alert kind="error">{errorMessage(slots.error)}</Alert>}
      {date && slots.data && (
        <fieldset className="slot-fieldset">
          <legend>Time {slots.data.isClosed && <span className="muted">— {slots.data.closedReason}</span>}</legend>
          <div className="slot-grid">
            {slots.data.slots.map((slot) => {
              const isCurrent = keepTime && slot.startTime === keepTime
              const open = slot.status === 'Open'
              const selected = selectedTime === slot.startTime
              return (
                <button key={slot.startTime} type="button" disabled={!open}
                  className={`slot slot-${slot.status.toLowerCase()}${selected ? ' slot-selected' : ''}`}
                  aria-pressed={selected} onClick={() => onTimeChange(slot.startTime)}
                  title={open ? undefined : isCurrent ? 'Your current time' : STATUS_TEXT[slot.status]}>
                  <span className="slot-time">{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</span>
                  <span className="slot-status">{isCurrent ? 'Current' : STATUS_TEXT[slot.status]}</span>
                </button>
              )
            })}
          </div>
          <div className="slot-legend" aria-hidden="true">
            <span><i className="legend legend-open" /> Available</span>
            <span><i className="legend legend-booked" /> Booked</span>
            <span><i className="legend legend-blocked" /> Unavailable</span>
          </div>
        </fieldset>
      )}
    </div>
  )
}
