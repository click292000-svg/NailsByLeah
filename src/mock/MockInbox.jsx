import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { getDb, resetDb, saveDb, subscribeDb } from './db'
import { formatDateTime } from '../lib/format'

/**
 * Demo-only panel: shows the emails the backend would send (verification codes, reset links,
 * confirmations) and a few switches for testing. Rendered only when VITE_USE_MOCK_API is on.
 */
export function MockInbox() {
  const db = useSyncExternalStore(subscribeDb, getDb)
  const [open, setOpen] = useState(false)
  const emails = db.outbox

  const toggleFailure = () => {
    getDb().flags.failNextPayment = !getDb().flags.failNextPayment
    saveDb()
  }

  const reset = () => {
    if (!window.confirm('Reset all demo data? Bookings and accounts you created will be removed.')) return
    resetDb()
    sessionStorage.clear()
    window.location.assign('/')
  }

  return (
    <div className="mock-inbox">
      {open && (
        <section className="mock-panel" aria-label="Mock inbox">
          <div className="mock-panel-head">
            <strong>Mock inbox</strong>
            <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Close mock inbox">×</button>
          </div>
          <p className="muted small">Emails the backend would send. Nothing leaves your browser.</p>
          <div className="mock-emails">
            {emails.length === 0 && <p className="muted">No emails yet. Register or use Forgot password.</p>}
            {emails.map((email) => (
              <article key={email.id} className="mock-email">
                <div className="muted small">{formatDateTime(email.createdAt)} · to {email.to}</div>
                <strong>{email.subject}</strong>
                <p>{email.body}</p>
                {email.code && <div className="mock-code">Code: <span className="mono">{email.code}</span></div>}
                {email.link && <Link to={new URL(email.link).pathname + new URL(email.link).search} onClick={() => setOpen(false)}>Open reset link</Link>}
              </article>
            ))}
          </div>
          <div className="mock-tools">
            <label className="checkbox-inline">
              <input type="checkbox" checked={db.flags.failNextPayment} onChange={toggleFailure} />
              <span>Make the next payment fail</span>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Reset demo data</button>
          </div>
        </section>
      )}
      <button type="button" className="mock-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        ✉ Mock inbox{emails.length > 0 && <span className="mock-count">{emails.length}</span>}
      </button>
    </div>
  )
}
