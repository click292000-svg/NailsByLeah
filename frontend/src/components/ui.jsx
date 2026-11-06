import { useId } from 'react'
import { formatMoney } from '../lib/format'

// Small building blocks shared by every page. All user text is rendered as React children,
// which React escapes; nothing here uses dangerouslySetInnerHTML (Ref 1.1).

export function Spinner({ label = 'Loading', small = false }) {
  return <span className={small ? 'spinner spinner-sm' : 'spinner'} role="status" aria-label={label} />
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="page-loader">
      <Spinner label={label} />
      <span>{label}</span>
    </div>
  )
}

/** Button that shows a spinner and stays disabled while `loading` (Ref 10.7, 12.4). */
export function Button({ variant = 'primary', size, loading = false, disabled, children, className = '', type = 'button', ...props }) {
  const classes = ['btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner small label="Working" />}
      <span>{children}</span>
    </button>
  )
}

export function Alert({ kind = 'info', title, children, onClose }) {
  if (!children && !title) return null
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div>
        {title && <strong className="alert-title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  )
}

const STATUS_LABELS = { NoShow: 'No-show' }

export function StatusBadge({ status }) {
  return <span className={`badge badge-${String(status).toLowerCase()}`}>{STATUS_LABELS[status] ?? status}</span>
}

export const Money = ({ amount }) => <span className="money">{formatMoney(amount)}</span>

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}

/** A summary number (dashboard, reports): label, value, a one-line explanation and an optional link. */
export function StatCard({ label, value, hint, dot, action }) {
  return (
    <div className="stat">
      <span className="stat-label">{dot && <span className={`stat-dot stat-dot-${dot}`} aria-hidden="true" />}{label}</span>
      <span className="stat-value">{value}</span>
      {(hint || action) && <span className="stat-hint">{hint}{action && <span className="stat-action">{action}</span>}</span>}
    </div>
  )
}

/** Previous / Next for long lists. Shown only when there is more than one page. */
export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Pages">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span className="muted small">Page {page} of {pages}</span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  )
}

/** Label, input, hint, counter and error message with the right ARIA wiring. */
export function Field({ label, error, hint, counter, children, required }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={error ? 'field field-invalid' : 'field'}>
      <div className="field-top">
        <label htmlFor={id} className="field-label">
          {label}
          {required && <span className="required" aria-hidden="true"> *</span>}
        </label>
        {counter && <span className="field-counter" aria-live="polite">{counter}</span>}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <div id={hintId} className="field-hint">{hint}</div>}
      {error && <div id={errorId} className="field-error">{error}</div>}
    </div>
  )
}

export function TextField({ label, error, hint, required, ...inputProps }) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(aria) => <input className="input" required={required} {...aria} {...inputProps} />}
    </Field>
  )
}

export function SelectField({ label, error, hint, required, options, placeholder, ...selectProps }) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {(aria) => (
        <select className="input" required={required} {...aria} {...selectProps}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}
