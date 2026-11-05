import { useRef, useState } from 'react'
import { LegalDocumentModal } from './Modal'
import { Alert, Button, Money, StatusBadge } from './ui'

const METHODS = [
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
]

/** What the client pays now for each option. The server works out the same amounts; it never takes them from here. */
export const amountNow = (quote, option) => (option === 'Full' ? quote.fullAmount : quote.deposit)
export const balanceAfter = (quote, option) => Math.max(0, quote.total - amountNow(quote, option))

/**
 * Payment step: deposit or full payment, then GCash or Maya. The Pay button stays disabled until the client agrees
 * to the booking policy and Terms & Conditions (Ref 2.3), for either option, and is disabled with a loading state from the first click until the
 * server answers, so only one request is ever sent (Ref 12.4). The booking then waits for Leyah's confirmation.
 */
export function PaymentPanel({ quote, option, onOptionChange, onPay, error }) {
  const [method, setMethod] = useState('GCash')
  const [understood, setUnderstood] = useState(false)
  const [paying, setPaying] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
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

  const options = [
    { value: 'Deposit', title: 'Booking deposit', note: <>Pay the rest (<Money amount={balanceAfter(quote, 'Deposit')} />) at the salon</> },
    { value: 'Full', title: 'Full payment', note: <>Nothing left to pay at the salon</> },
  ]

  return (
    <div className="payment-panel">
      <fieldset className="method-fieldset" disabled={paying}>
        <legend className="pay-step-title"><i aria-hidden="true">1</i> How much would you like to pay now?</legend>
        <div className="pay-options">
          {options.map((o) => (
            <label key={o.value} className={option === o.value ? 'pay-option selected' : 'pay-option'}>
              <input type="radio" name="payment-option" value={o.value} checked={option === o.value}
                onChange={() => onOptionChange(o.value)} aria-label={o.title} />
              <span className="pay-option-title">{o.title}</span>
              <span className="pay-option-amount"><Money amount={amountNow(quote, o.value)} /></span>
              <span className="pay-option-note">{o.note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="method-fieldset" disabled={paying}>
        <legend className="pay-step-title"><i aria-hidden="true">2</i> Pay with</legend>
        <div className="method-options">
          {METHODS.map((m) => (
            <label key={m.value} className={method === m.value ? 'method-option selected' : 'method-option'}>
              <input type="radio" name="payment-method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} aria-label={m.label} />
              <span className={`wallet-mark wallet-mark-${m.value.toLowerCase()}`} aria-hidden="true">{m.label[0]}</span>
              <span className="method-text">
                <span className={`wallet wallet-${m.value.toLowerCase()}`}>{m.label}</span>
                <span className="muted small">E-wallet</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="pay-step-title"><i aria-hidden="true">3</i> Review and agree</div>
        <div className={understood ? 'deposit-warning agreed' : 'deposit-warning'} role="note">
          <p className="deposit-notice">
            <strong>The <Money amount={quote.deposit} /> booking deposit is non-refundable, including if you cancel or do not show up.</strong>
            {' '}{option === 'Full' ? 'It is included in your full payment, not charged on top.' : 'It counts toward your total.'}
          </p>
          <label className="checkbox-inline">
            <input type="checkbox" checked={understood} disabled={paying} onChange={(e) => setUnderstood(e.target.checked)} />
            <span>
              I agree to the booking policy and the{' '}
              <button type="button" className="link-button" onClick={() => setShowTerms(true)}>Terms &amp; Conditions</button>
            </span>
          </label>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {paying && (
        <div className="pending-note" role="status">
          <StatusBadge status="Pending" /> Waiting for {method} to confirm your payment…
        </div>
      )}

      <Button onClick={pay} disabled={!understood} loading={paying} className="btn-lg pay-button">
        <svg className="pay-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6z" /></svg>
        Pay <Money amount={amountNow(quote, option)} />{option === 'Full' ? ' in full' : ' deposit'}
      </Button>
      <p className="pay-note muted small">
        {understood ? 'You get a receipt right away. Leyah then checks the payment and confirms your appointment.' : 'Please accept the booking policy to continue.'}
      </p>
      {showTerms && <LegalDocumentModal document="terms" onClose={() => setShowTerms(false)} />}
    </div>
  )
}
