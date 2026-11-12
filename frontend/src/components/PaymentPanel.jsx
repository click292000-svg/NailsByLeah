import { useRef, useState } from 'react'
import { LegalDocumentModal } from './Modal'
import { Alert, Button, Money, StatusBadge } from './ui'
import { useSalon } from './SalonProfile'

const Icon = ({ children, className = 'agree-icon' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
)
const CalendarCheckIcon = () => (
  <Icon className="agree-deposit-icon"><rect x="3" y="5" width="16" height="15" rx="2.5" /><path d="M3 10h16M8 3v4M14 3v4" /><circle cx="18" cy="18" r="4" fill="var(--white)" /><path d="M16.3 18l1.2 1.2 2.2-2.4" /></Icon>
)
const ChevronIcon = () => <Icon className="agree-chevron"><path d="M9 6l6 6-6 6" /></Icon>
const InfoIcon = () => <Icon className="agree-info"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>

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
 * Payment step: deposit or full payment, then GCash or Maya. The client must open the booking policy and Terms &
 * Conditions and read to the end before the agreement box can be ticked; it is never ticked for them. The Pay button
 * stays disabled until it is ticked (Ref 2.3), for either option, and the server refuses a booking without the
 * current Terms version. Pay is disabled with a loading state from the first click until the
 * server answers, so only one request is ever sent (Ref 12.4). The booking then waits for Leyah's confirmation.
 */
export function PaymentPanel({ quote, option, onOptionChange, onPay, error }) {
  const [method, setMethod] = useState('GCash')
  const { paymentAccountName } = useSalon()
  const [understood, setUnderstood] = useState(false)
  const [read, setRead] = useState(false) // opened the Terms and reached the end
  const [nudge, setNudge] = useState(null)
  const [paying, setPaying] = useState(false)
  const [showTerms, setShowTerms] = useState(null) // 'read': must reach the end; 'reference': already read
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
          <div className="agree-deposit" role="note">
            <CalendarCheckIcon />
            <div>
              <p className="agree-deposit-title"><Money amount={quote.deposit} /> booking deposit</p>
              <p className="agree-deposit-text">
                Non-refundable for cancellations and no-shows.{' '}
                {option === 'Full' ? 'It is included in your full payment, not charged on top.' : 'This amount is deducted from your total service cost.'}
              </p>
            </div>
          </div>

          <p className="agree-steps-intro">Two quick steps before you can pay:</p>
          <button type="button" className={read ? 'agree-review is-read' : 'agree-review is-next'}
            onClick={() => { setNudge(null); setShowTerms(read ? 'reference' : 'read') }}>
            <span className={read ? 'agree-step done' : 'agree-step'} aria-hidden="true">{read ? '✓' : '1'}</span>
            <span className="agree-review-text">
              <span className="agree-review-title">Review booking policies</span>
              <span className="agree-review-sub">{read ? 'Terms & Conditions · ✓ Read to the end' : 'Terms & Conditions · Required before payment: open it and scroll to the end'}</span>
            </span>
            <span className={read ? 'agree-review-action is-done' : 'agree-review-action'}>{read ? 'Open again' : 'Read now'}<ChevronIcon /></span>
          </button>

          {/* The click on a disabled box doesn't reach it, so the wrapper explains why it can't be ticked yet. */}
          <label className={read ? 'agree-check' : 'agree-check is-locked'}
            onClick={() => !read && setNudge('Please open and read the booking policies to the end first.')}>
            <span className={understood ? 'agree-step done' : read ? 'agree-step' : 'agree-step locked'} aria-hidden="true">{understood ? '✓' : '2'}</span>
            <span>I have read and agree to the <strong>booking policies</strong> and <strong>Terms &amp; Conditions</strong>.</span>
            <input type="checkbox" checked={understood} disabled={paying || !read} aria-describedby="terms-help"
              onChange={(e) => { setUnderstood(e.target.checked); setNudge(null) }} />
          </label>
          <p id="terms-help" className={nudge ? 'agree-hint field-error' : 'agree-hint'}>
            <InfoIcon />
            <span>{nudge ?? (understood ? 'Agreed. You can pay now.' : read ? 'Now tick the box to agree.' : 'Step 2 unlocks once you have read the policies to the end.')}</span>
          </p>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {paying && (
        <div className="pending-note" role="status">
          <StatusBadge status="Pending" /> Waiting for {method} to confirm your payment…
        </div>
      )}

      <Button onClick={pay} disabled={!understood || !read} loading={paying} className="btn-lg pay-button">
        <svg className="pay-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6z" /></svg>
        Pay <Money amount={amountNow(quote, option)} />{option === 'Full' ? ' in full' : ' deposit'}
      </Button>
      <p className="pay-note muted small">
        {understood ? 'You get a receipt right away. Leyah then checks the payment and confirms your appointment.'
          : read ? 'Tick the box in step 2 to continue.' : 'Read the booking policies in step 1 to continue.'}
      </p>
      {/* Once read, opening them again is just for reference: no need to scroll to the end a second time. */}
      {showTerms && <LegalDocumentModal document="terms" onClose={() => setShowTerms(null)} onReadToEnd={showTerms === 'read' ? () => setRead(true) : undefined} />}
    </div>
  )
}
