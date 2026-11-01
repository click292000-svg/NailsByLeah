import { useEffect, useState } from 'react'
import { Field } from './ui'
import { LIMITS, PASSWORD_RULES, digitsOnly } from '../validation/rules'
import { api } from '../api'
import { useDebouncedValue } from '../hooks/useAsync'

/** First/Last name: any characters, 75 max, with a live "12/75" counter (Ref 1.1, 9.3). */
export function NameField({ label, value, onChange, error, ...props }) {
  return (
    <Field label={label} error={error} required counter={`${value.length}/${LIMITS.nameMax}`}>
      {(aria) => (
        <input className="input" type="text" autoComplete={props.autoComplete} maxLength={LIMITS.nameMax} value={value}
          onChange={(e) => onChange(e.target.value.slice(0, LIMITS.nameMax))} required {...aria} {...props} />
      )}
    </Field>
  )
}

const CONTROL_KEYS = new Set(['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

/**
 * Digits only (Ref 1.3): letters and symbols are blocked as they are typed, pasted text keeps only
 * its digits, and anything else that slips in (autofill, mobile keyboards) is stripped on change.
 */
export function PhoneField({ value, onChange, error, label = 'Phone Number' }) {
  const insert = (input, text) => {
    const { selectionStart: start, selectionEnd: end } = input
    const next = digitsOnly(value.slice(0, start ?? value.length) + text + value.slice(end ?? value.length))
    onChange(next.slice(0, LIMITS.phoneMaxDigits))
  }
  return (
    <Field label={label} error={error} required hint="Numbers only, e.g. 09171234567">
      {(aria) => (
        <input className="input" type="tel" inputMode="numeric" autoComplete="tel" maxLength={LIMITS.phoneMaxDigits} value={value} required
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || CONTROL_KEYS.has(e.key)) return
            if (!/^\d$/.test(e.key)) e.preventDefault()
          }}
          onPaste={(e) => {
            e.preventDefault()
            insert(e.currentTarget, e.clipboardData.getData('text'))
          }}
          onChange={(e) => onChange(digitsOnly(e.target.value).slice(0, LIMITS.phoneMaxDigits))}
          {...aria} />
      )}
    </Field>
  )
}

const BLOCKED_SHORTCUTS = new Set(['c', 'x', 'v'])

/**
 * Password input with a show/hide eye toggle (Ref 8.6). Copy, cut and paste are blocked
 * for keyboard shortcuts and the right-click menu (Ref 1.5).
 */
export function PasswordField({ label = 'Password', value, onChange, error, hint, autoComplete = 'current-password', children }) {
  const [visible, setVisible] = useState(false)
  const block = (e) => e.preventDefault()
  return (
    <Field label={label} error={error} hint={hint} required>
      {(aria) => (
        <>
          <div className="password-wrap">
            <input className="input" type={visible ? 'text' : 'password'} value={value} autoComplete={autoComplete} required
              onChange={(e) => onChange(e.target.value)}
              onCopy={block} onCut={block} onPaste={block} onDrop={block} onContextMenu={block}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && BLOCKED_SHORTCUTS.has(e.key.toLowerCase())) e.preventDefault()
              }}
              {...aria} />
            <button type="button" className="password-toggle" onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>
              <EyeIcon open={!visible} />
            </button>
          </div>
          {children}
        </>
      )}
    </Field>
  )
}

function EyeIcon({ open }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

/** Live password rule checklist (Ref 8.2). */
export function PasswordRules({ password }) {
  return (
    <ul className="password-rules" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li key={rule.id} className={met ? 'rule-met' : 'rule-unmet'}>
            <span aria-hidden="true">{met ? '✓' : '○'}</span> {rule.label}
            <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Username with a debounced availability check while typing (Ref 1.2, 9.2).
 * `onAvailabilityChange(false)` lets the form block submission while the name is taken.
 */
export function UsernameField({ value, onChange, error, onAvailabilityChange }) {
  const debounced = useDebouncedValue(value.trim(), 400)
  // The last answer from the server, for the username it was asked about.
  const [checked, setChecked] = useState({ username: null, state: 'idle', message: null })
  const tooShort = debounced.length < LIMITS.usernameMin

  useEffect(() => {
    if (tooShort) {
      onAvailabilityChange?.(null)
      return undefined
    }
    let active = true
    api.auth.usernameAvailability(debounced)
      .then((result) => {
        if (!active) return
        setChecked({ username: debounced, state: result.available ? 'available' : 'taken', message: result.message })
        onAvailabilityChange?.(result.available)
      })
      .catch(() => active && setChecked({ username: debounced, state: 'idle', message: null }))
    return () => {
      active = false
    }
  }, [debounced, tooShort, onAvailabilityChange])

  const status = tooShort ? { state: 'idle', message: null }
    : checked.username === debounced && debounced === value.trim() ? checked
      : { state: 'checking', message: 'Checking availability…' }

  const shownError = error ?? (status.state === 'taken' ? status.message : null)
  return (
    <Field label="Username" error={shownError} required
      hint={status.state === 'checking' || status.state === 'available' ? status.message : `${LIMITS.usernameMin}–${LIMITS.usernameMax} characters`}>
      {(aria) => (
        <input className={status.state === 'available' ? 'input input-ok' : 'input'} type="text" autoComplete="username"
          maxLength={LIMITS.usernameMax} value={value} onChange={(e) => onChange(e.target.value)} required {...aria} />
      )}
    </Field>
  )
}
