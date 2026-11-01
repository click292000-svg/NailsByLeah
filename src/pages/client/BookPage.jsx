import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { calculateQuote } from '../../lib/pricing'
import { formatDate, formatTime } from '../../lib/format'
import { ApiError, errorMessage } from '../../api/errors'
import { LIMITS } from '../../validation/rules'
import { Alert, Button, Card, Money, PageHeader, PageLoader } from '../../components/ui'
import { SlotPicker } from '../../components/SlotPicker'
import { PaymentPanel } from '../../components/PaymentPanel'
import { Receipt } from '../../components/Receipt'

const STEPS = ['Service', 'Date & time', 'Note for Leah', 'Summary & payment']

export default function BookPage() {
  const data = useAsync(() => Promise.all([api.catalog.get(), api.catalog.lookups()]), [])
  if (data.loading) return <PageLoader label="Loading services…" />
  if (data.error) return <Alert kind="error">{errorMessage(data.error)}</Alert>
  const [catalog, lookups] = data.data
  return <BookingWizard catalog={catalog} lookups={lookups} />
}

function BookingWizard({ catalog, lookups }) {
  const [step, setStep] = useState(0)
  const [serviceId, setServiceId] = useState(null)
  const [nails, setNails] = useState({}) // addOnId → nail count
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('None')
  const [stepError, setStepError] = useState(null)
  const [payError, setPayError] = useState(null)
  const [result, setResult] = useState(null)

  const service = catalog.services.find((s) => s.id === serviceId)
  const selectedAddOns = catalog.addOns.filter((a) => nails[a.id]).map((addOn) => ({ addOn, nailCount: nails[addOn.id] }))
  // Recalculated on every change to the service or add-ons (Ref 10.4).
  const quote = calculateQuote(service, selectedAddOns, catalog.depositAmount)

  // One key per set of booking details: repeated or retried Pay clicks for the same booking are
  // recognised by the server and never charged twice (Ref 12.4).
  const detailsKey = JSON.stringify([serviceId, nails, date, time, note])
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [detailsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    const problem = [
      !service && 'Choose a service to continue.',
      (!date || !time) && 'Choose a date and an available time.',
      null,
    ][step]
    if (problem) {
      setStepError(problem)
      return
    }
    setStepError(null)
    setStep((s) => s + 1)
  }

  const pay = async (paymentMethod) => {
    setPayError(null)
    try {
      const response = await api.bookings.create({
        serviceId, addOns: selectedAddOns.map((a) => ({ addOnId: a.addOn.id, nailCount: a.nailCount })),
        bookingDate: date, startTime: time, noteForLeah: note, paymentMethod, depositAcknowledged: true, idempotencyKey,
      })
      setResult(response)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slot_unavailable') {
        setTime('')
        setStep(1)
        setStepError(err.message)
      } else {
        setPayError(errorMessage(err))
      }
    }
  }

  if (result) {
    return (
      <div className="narrow stack">
        <PageHeader title="You're booked!" subtitle={`See you on ${formatDate(result.booking.bookingDate)} at ${formatTime(result.booking.startTime)}.`} />
        <Card>
          <Receipt receipt={result.receipt} booking={result.booking} />
        </Card>
        <div className="row">
          <Link to="/bookings" className="btn btn-primary">Go to my bookings</Link>
          <Link to="/" className="btn btn-secondary">Back to home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <PageHeader title="Book an appointment" />
      <ol className="stepper" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="step-number">{i + 1}</span> <span className="step-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="booking-layout">
        <Card className="booking-main">
          {stepError && <Alert kind="error">{stepError}</Alert>}
          {step === 0 && <ServiceStep catalog={catalog} serviceId={serviceId} onService={setServiceId} nails={nails} onNails={setNails} />}
          {step === 1 && (
            <SlotPicker date={date} onDateChange={setDate} selectedTime={time} onTimeChange={setTime} />
          )}
          {step === 2 && <NoteStep options={lookups.noteForLeahOptions} value={note} onChange={setNote} />}
          {step === 3 && (
            <div className="stack">
              <h2>Booking summary</h2>
              <Summary quote={quote} date={date} time={time} noteLabel={lookups.noteForLeahOptions.find((o) => o.value === note)?.label} />
              <PaymentPanel deposit={quote.deposit} onPay={pay} error={payError} />
            </div>
          )}
          <div className="wizard-nav">
            {step > 0 && <Button variant="secondary" onClick={() => { setStepError(null); setStep((s) => s - 1) }}>Back</Button>}
            {step < 3 && <Button onClick={next}>Continue</Button>}
          </div>
        </Card>

        {step < 3 && (
          <aside className="booking-aside">
            <Card title="Your total">
              <Summary quote={quote} date={date} time={time} compact />
            </Card>
          </aside>
        )}
      </div>
    </div>
  )
}

function ServiceStep({ catalog, serviceId, onService, nails, onNails }) {
  const groups = [
    ['Soft Gel', catalog.services.filter((s) => s.category === 'SoftGel')],
    ['Removal', catalog.services.filter((s) => s.category === 'Removal')],
  ]
  const setCount = (id, count) => onNails((current) => {
    const nextCounts = { ...current }
    if (count <= 0) delete nextCounts[id]
    else nextCounts[id] = Math.min(LIMITS.maxNailsPerAddOn, count)
    return nextCounts
  })

  return (
    <div className="stack">
      <fieldset className="choice-fieldset">
        <legend><h2>Choose a service</h2></legend>
        {groups.map(([title, items]) => (
          <div key={title}>
            <h3 className="group-title">{title}</h3>
            <div className="choice-grid">
              {items.map((s) => (
                <label key={s.id} className={serviceId === s.id ? 'choice selected' : 'choice'}>
                  <input type="radio" name="service" checked={serviceId === s.id} onChange={() => onService(s.id)} />
                  <span className="choice-name">{s.name}</span>
                  <Money amount={s.price} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="choice-fieldset">
        <legend><h2>Add Stone add-ons <span className="muted small">(optional, priced per nail)</span></h2></legend>
        <div className="addon-list">
          {catalog.addOns.map((a) => {
            const count = nails[a.id] ?? 0
            return (
              <div key={a.id} className={count ? 'addon selected' : 'addon'}>
                <label className="addon-check">
                  <input type="checkbox" checked={count > 0} onChange={(e) => setCount(a.id, e.target.checked ? 1 : 0)} />
                  <span>{a.name}</span>
                  <span className="muted"><Money amount={a.price} /> / nail</span>
                </label>
                {count > 0 && (
                  <div className="counter" role="group" aria-label={`Number of nails for ${a.name}`}>
                    <button type="button" onClick={() => setCount(a.id, count - 1)} aria-label={`Fewer nails for ${a.name}`}>−</button>
                    <output aria-live="polite">{count} {count === 1 ? 'nail' : 'nails'}</output>
                    <button type="button" onClick={() => setCount(a.id, count + 1)} disabled={count >= LIMITS.maxNailsPerAddOn}
                      aria-label={`More nails for ${a.name}`}>+</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

/** "Note for Leah" as selectable chips instead of free text (Ref 2.4). */
function NoteStep({ options, value, onChange }) {
  return (
    <fieldset className="choice-fieldset">
      <legend><h2>Note for Leah</h2></legend>
      <p className="muted">Pick the note that fits best.</p>
      <div className="chips" role="radiogroup" aria-label="Note for Leah">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
            className={value === o.value ? 'chip selected' : 'chip'} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Service, add-ons, total and the required deposit (Ref 10.2). */
function Summary({ quote, date, time, noteLabel, compact = false }) {
  if (!quote.lines.length) return <p className="muted">Choose a service to see your total.</p>
  return (
    <div className="summary">
      <ul className="summary-lines">
        {quote.lines.map((line) => (
          <li key={`${line.category}-${line.itemId}`}>
            <span>
              {line.name}
              {line.pricingUnit === 'per nail' && <span className="muted"> × {line.quantity} {line.quantity === 1 ? 'nail' : 'nails'}</span>}
            </span>
            <Money amount={line.lineTotal} />
          </li>
        ))}
      </ul>
      <div className="summary-total"><span>Total</span><Money amount={quote.total} /></div>
      <div className="summary-row"><span>Deposit due now</span><Money amount={quote.deposit} /></div>
      <div className="summary-row muted"><span>Balance at the salon</span><Money amount={quote.balanceDue} /></div>
      {!compact && (
        <dl className="summary-details">
          <dt>Appointment</dt>
          <dd>{date && time ? `${formatDate(date)}, ${formatTime(time)}` : '—'}</dd>
          <dt>Note for Leah</dt>
          <dd>{noteLabel}</dd>
        </dl>
      )}
      {compact && date && time && <p className="muted small">{formatDate(date)}, {formatTime(time)}</p>}
    </div>
  )
}
