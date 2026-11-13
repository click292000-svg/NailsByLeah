import { useRef, useState } from 'react'
import { LegalDocumentModal } from './Modal'
import { Alert, Button, Money, StatusBadge } from './ui'
import { useSalon } from './SalonProfile'

const Icon = ({ children, className = 'agree-icon' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
)
const WarningIcon = () => (
  <Icon className="agree-deposit-icon"><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.3h.01" /></Icon>
)

// The wallets' own logos (frontend/public/img), so clients recognise them at a glance.
const WALLET_LOGOS = { GCash: '/img/wallet-gcash.png', Maya: '/img/wallet-maya.jpg' }

const METHODS = [
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
]

/** What the client pays now for each option. The server works out the same amounts; it never takes them from here. */
export const amountNow = (quote, option) => (option === 'Full' ? quote.fullAmount : quote.deposit)
export const balanceAfter = (quote, option) => Math.max(0, quote.total - amountNow(quote, option))

/**
 * Payment step: deposit or full payment, then GCash or Maya. As at sign-up, the client opens the Terms & Conditions,
 * reads to the end and agrees in that window; it is never agreed for them. The Pay button
 * stays disabled until it is ticked (Ref 2.3), for either option, and the server refuses a booking without the
 * current Terms version. Pay is disabled with a loading state from the first click until the
 * server answers, so only one request is ever sent (Ref 12.4). The booking then waits for Leyah's confirmation.
 */
export function PaymentPanel({ quote, option, onOptionChange, onPay, error }) {
  const [method, setMethod] = useState(null) // nothing is picked for the client: they choose
  const { paymentAccountName } = useSalon()
  const [understood, setUnderstood] = useState(false)
  const [read, setRead] = useState(false) // opened the Terms and reached the end
  const [paying, setPaying] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const inFlight = useRef(false)

  const ready = Boolean(option && method && understood)
  const pay = async () => {
    if (inFlight.current || !ready) return
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
              <span className={`wallet-mark wallet-mark-${m.value.toLowerCase()}`} aria-hidden="true">
                <img src={WALLET_LOGOS[m.value]} alt="" width="36" height="36" />
              </span>
              <span className="method-text">
                <span className={`wallet wallet-${m.value.toLowerCase()}`}>{m.label}</span>
                <span className="muted small">E-wallet</span>
              </span>
            </label>
          ))}
        </div>
        {paymentAccountName && <p className="pay-to muted small">Account name: <strong>{paymentAccountName}</strong></p>}
      </fieldset>

      <div>
        <div className="pay-step-title"><i aria-hidden="true">3</i> Review and agree</div>
        <div className={understood ? 'agree-box agreed' : 'agree-box'}>
          {/* A warning, so the non-refundable deposit isn't missed before paying. */}
          <div className="agree-deposit" role="note" aria-label="Deposit warning">
            <WarningIcon />
            <div>
              <p className="agree-deposit-label">Please note</p>
              <p className="agree-deposit-title"><Money amount={quote.deposit} /> booking deposit</p>
              <p className="agree-deposit-text">
                Non-refundable for cancellations and no-shows.{' '}
                {option === 'Full' ? 'It is included in your full payment, not charged on top.' : 'This amount is deducted from your total service cost.'}
              </p>
            </div>
          </div>

          {/* Like sign-up: one line opens the Terms window, which is read to the end and agreed to there. */}
          <div className={understood ? 'su-terms is-done' : 'su-terms'}>
            <p className="su-terms-text">
              Review and accept the{' '}
              <button type="button" className="su-terms-link" onClick={() => setShowTerms(true)} disabled={paying}>Terms &amp; Conditions</button>
              {' '}to continue.
            </p>
            <p className="su-terms-status" aria-live="polite">{understood ? '✓ Accepted' : 'Review required'}</p>
          </div>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {paying && (
        <div className="pending-note" role="status">
          <StatusBadge status="Pending" /> Waiting for {method} to confirm your payment…
        </div>
      )}

      <Button onClick={pay} disabled={!ready} loading={paying} className="btn-lg pay-button">
        <svg className="pay-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6z" /></svg>
        {option ? <>Pay <Money amount={amountNow(quote, option)} />{option === 'Full' ? ' in full' : ' deposit'}</> : 'Pay'}
      </Button>
      <p className="pay-note muted small">
        {!option ? 'Choose how much to pay now (step 1) to continue.'
          : !method ? 'Choose GCash or Maya (step 2) to continue.'
            : !understood ? 'Review and accept the Terms & Conditions to continue.'
              : 'You get a receipt right away. Leyah then checks the payment and confirms your appointment.'}
      </p>
      {/* Once read to the end, opening it again doesn't need another scroll to unlock the agreement. */}
      {showTerms && (
        <LegalDocumentModal document="terms" onClose={() => setShowTerms(false)} onReadToEnd={() => setRead(true)}
          agree={{ checked: understood, read, onChange: setUnderstood }} />
      )}
    </div>
  )
}
