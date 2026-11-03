import { useEffect, useId, useRef, useState } from 'react'
import { addDays, toIsoDate, today } from '../lib/dates'
import { formatDate } from '../lib/format'

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const monthOf = (iso) => `${iso.slice(0, 7)}-01`
const addMonths = (firstOfMonth, n) => {
  const [y, m] = firstOfMonth.split('-').map(Number)
  return toIsoDate(new Date(y, m - 1 + n, 1))
}
const monthTitle = (firstOfMonth) => {
  const [y, m] = firstOfMonth.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

/** The 42 days (6 weeks, Sunday first) shown for a month, including the end of the previous and start of the next. */
function monthGrid(firstOfMonth) {
  const [y, m] = firstOfMonth.split('-').map(Number)
  const start = addDays(firstOfMonth, -new Date(y, m - 1, 1).getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/**
 * One-day filter: "Any date", "Today" and "Tomorrow" in one tap, arrows to step a day at a time, and a
 * calendar in the salon's colours behind the date button. `value` is "yyyy-mm-dd" or '' for any date.
 */
export function DateFilter({ label, value, onChange }) {
  const labelId = useId()
  const [open, setOpen] = useState(false)
  const pickRef = useRef(null)
  const now = today()
  const tomorrow = addDays(now, 1)

  const choose = (iso) => {
    onChange(iso)
    setOpen(false)
    pickRef.current?.focus()
  }

  const quick = [
    { label: 'Any date', value: '' },
    { label: 'Today', value: now },
    { label: 'Tomorrow', value: tomorrow },
  ]

  return (
    <div className="date-filter" role="group" aria-labelledby={labelId}>
      <span className="field-label" id={labelId}>{label}</span>
      <div className="date-filter-row">
        <div className="segmented">
          {quick.map((q) => (
            <button key={q.label} type="button" aria-pressed={value === q.value} onClick={() => onChange(q.value)}>{q.label}</button>
          ))}
        </div>
        <div className="date-picker">
          <div className={`date-stepper${value && value !== now && value !== tomorrow ? ' is-picked' : ''}${open ? ' is-open' : ''}`}>
            <button type="button" className="date-stepper-arrow" aria-label="Previous day" onClick={() => onChange(addDays(value || now, -1))}>‹</button>
            <button ref={pickRef} type="button" className="date-stepper-pick" aria-haspopup="dialog" aria-expanded={open}
              aria-label={value ? `Booking date: ${formatDate(value)}. Change date` : 'Pick a date'} onClick={() => setOpen((o) => !o)}>
              <CalendarIcon />
              <span>{value ? formatDate(value) : 'Pick a date'}</span>
            </button>
            <button type="button" className="date-stepper-arrow" aria-label="Next day" onClick={() => onChange(addDays(value || now, 1))}>›</button>
          </div>
          {open && <CalendarPopover value={value} today={now} onChoose={choose} onClose={() => { setOpen(false); pickRef.current?.focus() }} anchor={pickRef} />}
        </div>
      </div>
    </div>
  )
}

/**
 * Month calendar. Click a day to choose it; with the keyboard, arrows move a day or a week, Page Up/Down a month,
 * Home/End to the start or end of the week, Enter chooses and Escape closes.
 */
function CalendarPopover({ value, today: now, onChoose, onClose, anchor }) {
  const [focused, setFocused] = useState(value || now)
  const [month, setMonth] = useState(monthOf(value || now))
  const panel = useRef(null)
  const titleId = useId()

  // Keep the focused day visible: moving past the edge of the month turns the page.
  const moveTo = (iso) => {
    setFocused(iso)
    if (monthOf(iso) !== month) setMonth(monthOf(iso))
  }

  // Keyboard focus follows the focused day (not the month buttons, so ‹ › can be clicked repeatedly).
  useEffect(() => {
    panel.current?.querySelector(`[data-day="${focused}"]`)?.focus()
  }, [focused])

  useEffect(() => {
    const away = (e) => { if (!panel.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose, anchor])

  const onKeyDown = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key in moves && e.target.dataset.day) { e.preventDefault(); moveTo(addDays(focused, moves[e.key])) }
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const target = addMonths(monthOf(focused), e.key === 'PageUp' ? -1 : 1)
      const day = Math.min(Number(focused.slice(8)), new Date(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0).getDate())
      moveTo(`${target.slice(0, 8)}${String(day).padStart(2, '0')}`)
    } else if ((e.key === 'Home' || e.key === 'End') && e.target.dataset.day) {
      e.preventDefault()
      const weekday = new Date(`${focused}T00:00:00`).getDay()
      moveTo(addDays(focused, e.key === 'Home' ? -weekday : 6 - weekday))
    }
  }

  const days = monthGrid(month)

  return (
    <div ref={panel} className="calendar-pop" role="dialog" aria-modal="false" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="calendar-pop-head">
        <button type="button" className="calendar-pop-nav" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <h3 id={titleId} aria-live="polite">{monthTitle(month)}</h3>
        <button type="button" className="calendar-pop-nav" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <div className="calendar-pop-grid" role="grid" aria-labelledby={titleId}>
        <div className="calendar-pop-row" role="row">
          {WEEKDAYS.map((d, i) => <span key={d} role="columnheader" className={i === 0 || i === 6 ? 'calendar-pop-weekday weekend' : 'calendar-pop-weekday'}>{d.slice(0, 2)}</span>)}
        </div>
        {[0, 1, 2, 3, 4, 5].map((week) => (
          <div key={week} className="calendar-pop-row" role="row">
            {days.slice(week * 7, week * 7 + 7).map((iso) => {
              const classes = ['calendar-pop-day']
              if (monthOf(iso) !== month) classes.push('outside')
              if (iso === now) classes.push('today')
              if (iso === value) classes.push('selected')
              return (
                <span key={iso} role="gridcell" aria-selected={iso === value}>
                  <button type="button" className={classes.join(' ')} data-day={iso} tabIndex={iso === focused ? 0 : -1}
                    aria-label={`${formatDate(iso)}${iso === now ? ', today' : ''}`} aria-current={iso === now ? 'date' : undefined}
                    onClick={() => onChoose(iso)} onFocus={() => setFocused(iso)}>
                    {Number(iso.slice(8))}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <div className="calendar-pop-foot">
        <button type="button" className="calendar-pop-link" onClick={() => onChoose('')}>Any date</button>
        <button type="button" className="calendar-pop-today" onClick={() => onChoose(now)}>Today</button>
      </div>
    </div>
  )
}
