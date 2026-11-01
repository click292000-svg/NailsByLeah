import { useRef, useState } from 'react'
import { Alert, Button, Money, StatusBadge } from './ui'

const METHODS = [
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
]

/**
 * Payment step. The Pay button stays disabled until the client checks "I understand" (Ref 2.3),
 * and is disabled with a loading state from the first click until the server answers, so only
 * one request is ever sent (Ref 12.4). While waiting, the booking shows as Pending (Ref 12.3).
 */
export function PaymentPanel({ deposit, onPay, error }) {
  const [method, setMethod] = useState('GCash')
  const [understood, setUnderstood] = useState(false)
  const [paying, setPaying] = useState(false)
  const inFlight = useRef(false)

  const pay = async () => {
    if (inFlight.current || !understood) return
    inFlight.current = true
    setPaying(true)
    try {
      await onPay(method)
    } finally {
      inFlight.current = false
      setPaying(false)
    }
  }

  return (
    <div className="payment-panel stack">
      <fieldset className="method-fieldset" disabled={paying}>
        <legend>Pay the deposit with</legend>
        <div className="method-options">
          {METHODS.map((m) => (
            <label key={m.value} className={method === m.value ? 'method-option selected' : 'method-option'}>
              <input type="radio" name="payment-method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} />
              <span className={`wallet wallet-${m.value.toLowerCase()}`}>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="deposit-warning" role="note">
        <strong>The booking deposit is non-refundable.</strong>
        <label className="checkbox-inline">
          <input type="checkbox" checked={understood} disabled={paying} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>I understand</span>
        </label>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {paying && (
        <div className="pending-note" role="status">
          <StatusBadge status="Pending" /> Waiting for {method} to confirm your deposit…
        </div>
      )}

      <Button onClick={pay} disabled={!understood} loading={paying} className="btn-block btn-lg">
        Pay <Money amount={deposit} /> deposit
      </Button>
    </div>
  )
}
