import { useEffect, useId, useRef, useState } from 'react'

const COLUMNS = 3

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

const Chevron = () => (
  <svg className="time-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const hourOf = (value) => Number(value.slice(0, 2))
const partOfDay = (value) => (hourOf(value) < 12 ? 'Morning' : hourOf(value) < 18 ? 'Afternoon' : 'Evening')

/**
 * A time chooser in the salon's colours: the times in a short grid grouped by part of the day, instead of a long
 * browser dropdown. Arrow keys move between times, Home and End go to the first and last, Escape closes it.
 * `options` are { value: 'hh:mm:ss', label }.
 */
export function TimeSelect({ label, value, options, onChange }) {
  const labelId = useId()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const button = useRef(null)
  const panel = useRef(null)
  const selected = options.find((o) => o.value === value)

  const groups = []
  for (const option of options) {
    const part = partOfDay(option.value)
    if (groups.at(-1)?.part !== part) groups.push({ part, options: [] })
    groups.at(-1).options.push(option)
  }

  useEffect(() => {
    if (!open) return undefined
    panel.current?.querySelector('[aria-pressed="true"]')?.focus()
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    const times = [...panel.current.querySelectorAll('button')]
    const here = times.indexOf(e.target)
    if (here < 0) return
    const next = { ArrowLeft: here - 1, ArrowRight: here + 1, ArrowUp: here - COLUMNS, ArrowDown: here + COLUMNS, Home: 0, End: times.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    times[Math.min(times.length - 1, Math.max(0, next))].focus()
  }

  return (
    <div className="field" role="group" aria-labelledby={labelId}>
      <div className="field-top"><span className="field-label" id={labelId}>{label}</span></div>
      <div ref={box} className="date-picker" onKeyDown={onKeyDown}>
        <button ref={button} type="button" className={open ? 'input time-select is-open' : 'input time-select'}
          aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${selected?.label ?? 'not set'}. Change time`} onClick={() => setOpen((o) => !o)}>
          <ClockIcon />
          <span>{selected?.label ?? 'Choose a time'}</span>
          <Chevron />
        </button>
        {open && (
          <div ref={panel} className="calendar-pop time-pop" role="dialog" aria-labelledby={labelId}>
            {groups.map((group) => (
              <div key={group.part} className="time-pop-group" role="group" aria-label={group.part}>
                <h3 className="time-pop-title">{group.part}</h3>
                <div className="time-pop-grid">
                  {group.options.map((option) => (
                    <button key={option.value} type="button" className={option.value === value ? 'time-pop-time selected' : 'time-pop-time'}
                      aria-pressed={option.value === value} onClick={() => { onChange(option.value); close() }}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
