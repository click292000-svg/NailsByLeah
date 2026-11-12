import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, fieldErrors } from '../../api/errors'
import { calculateQuote } from '../../lib/pricing'
import { softGelSets, withDesignName } from '../../lib/services'
import { colorLabel } from '../../lib/shades'
import { formatTime } from '../../lib/format'
import { today } from '../../lib/dates'
import { Modal } from '../../components/Modal'
import { DayPicker } from '../../components/DateFilter'
import { Alert, Button, Field, Money, SelectField, TextField } from '../../components/ui'
import { LIMITS } from '../../validation/rules'

const PAID = [
  { value: 'None', label: 'Nothing yet' },
  { value: 'Deposit', label: 'The deposit' },
  { value: 'Full', label: 'The full amount' },
]
const METHODS = [{ value: 'Cash', label: 'Cash' }, { value: 'GCash', label: 'GCash' }, { value: 'Maya', label: 'Maya' }]
// Clients with an account book online themselves; Leyah only books people who come in or message the salon's pages.
const SOURCES = [
  { value: 'Walk-in', note: 'Walk-in' },
  { value: 'Facebook', note: 'Booked through Facebook' },
  { value: 'Instagram', note: 'Booked through Instagram' },
]

/**
 * Leyah books an appointment herself, for a walk-in or someone who messaged on Facebook or Instagram. The booking is
 * confirmed straight away, and what was already paid is recorded as received.
 */
export function NewBookingDialog({ onClose, onCreated }) {
  const catalog = useAsync(() => api.catalog.get(), [])
  const [source, setSource] = useState('Walk-in')
  const [guest, setGuest] = useState({ name: '', phone: '' })

  const [serviceId, setServiceId] = useState('')
  const [removalId, setRemovalId] = useState('')
  const [nails, setNails] = useState({}) // addOnId -> nail count
  const [color, setColor] = useState('')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState('None')
  const [method, setMethod] = useState('Cash')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const services = catalog.data?.services ?? []
  const service = services.find((s) => String(s.id) === serviceId)
  const removal = services.find((s) => String(s.id) === removalId)
  const isSet = service?.category === 'SoftGel'
  const slots = useAsync(() => (serviceId && date ? api.catalog.slots(date, serviceId, isSet ? removalId || undefined : undefined) : Promise.resolve(null)),
    [serviceId, removalId, date])
  const openTimes = (slots.data?.slots ?? []).filter((s) => s.status === 'Open')

  if (catalog.loading && !catalog.data) return <Modal title="New booking" onClose={onClose}><p className="muted">Loading the price list…</p></Modal>
  if (catalog.error) return <Modal title="New booking" onClose={onClose}><Alert kind="error">{errorMessage(catalog.error)}</Alert></Modal>

  // The sets as clients book them, each "with design" version right after its set, then a removal on its own.
  const serviceOptions = [
    ...softGelSets(services).flatMap(({ base, design }) => [
      { value: String(base.id), label: `${base.name} · ₱${base.price}` },
      ...(design ? [{ value: String(design.id), label: `${withDesignName(base)} · ₱${design.price}` }] : []),
    ]),
    ...services.filter((s) => s.category === 'Removal').map((s) => ({ value: String(s.id), label: `Removal only: ${s.name} · ₱${s.price}` })),
  ]
  const removals = services.filter((s) => s.category === 'Removal')
  const addOns = service?.allowsAddOns ? catalog.data.addOns : []
  const chosenAddOns = addOns.filter((a) => nails[a.id] > 0).map((a) => ({ addOn: a, nailCount: nails[a.id] }))
  const quote = service ? calculateQuote(service, chosenAddOns, catalog.data.depositAmount, isSet ? removal : null) : null
  const colors = catalog.data.nailColors ?? []
  const pickService = (value) => { setServiceId(value); setTime(''); setNails({}) }

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!guest.name.trim()) found.guestName = "Type the client's name."
    if (guest.phone && !/^\d{11}$/.test(guest.phone)) found.guestPhone = 'Not a valid phone number.'
    if (!service) found.serviceId = 'Choose a service.'
    if (!time) found.startTime = 'Choose a time.'
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const booking = await api.admin.createBooking({
        guestName: guest.name.trim(),
        guestPhone: guest.phone || null,
        serviceId: service.id,
        removalServiceId: isSet && removal ? removal.id : null,
        addOns: chosenAddOns.map(({ addOn, nailCount }) => ({ addOnId: addOn.id, nailCount, hand: 'Both' })),
        nailColor: isSet && color ? color : null,
        bookingDate: date,
        startTime: time,
        // Where the booking came from leads the note, so it shows wherever the note does.
        note: [SOURCES.find((x) => x.value === source).note, note.trim()].filter(Boolean).join('. '),
        paid,
        paymentMethod: method,
        paymentReference: paid !== 'None' && reference.trim() ? reference.trim() : null,
      })
      onCreated(booking)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: Object.keys(fieldErrors(err)).length ? null : errorMessage(err) })
      setSaving(false)
    }
  }

  return (
    <Modal wide title="New booking" onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="new-booking" loading={saving}>Book and confirm</Button>
    </>}>
      <form id="new-booking" className="nb stack" onSubmit={submit} noValidate>
        <p className="muted small">For walk-ins and clients who message on Facebook or Instagram. It is confirmed straight away.</p>
        {errors.form && <Alert kind="error">{errors.form}</Alert>}

        <section className="nb-section" aria-label="Client">
          <h3>Client</h3>
          <div className="chips" role="radiogroup" aria-label="Booked through">
            {SOURCES.map((x) => (
              <button key={x.value} type="button" role="radio" aria-checked={source === x.value} className={source === x.value ? 'chip selected' : 'chip'}
                onClick={() => setSource(x.value)}>{x.value}</button>
            ))}
          </div>
          <div className="grid-2">
            <TextField label="Name" required maxLength={LIMITS.guestNameMax} value={guest.name} error={errors.guestName}
              onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))} />
            <TextField label="Phone (optional)" inputMode="numeric" maxLength={11} placeholder="09171234567" value={guest.phone} error={errors.guestPhone}
              onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value.replace(/\D/g, '') }))} />
          </div>
        </section>

        <section className="nb-section" aria-label="Service">
          <h3>Service</h3>
          <div className="grid-2">
            <SelectField label="Service" required placeholder="Choose a service" options={serviceOptions} value={serviceId} error={errors.serviceId}
              onChange={(e) => pickService(e.target.value)} />
            {isSet && (
              <SelectField label="Removal first (optional)" placeholder="No removal" value={removalId}
                options={removals.map((r) => ({ value: String(r.id), label: `${r.name} · ₱${r.price}` }))}
                onChange={(e) => { setRemovalId(e.target.value); setTime('') }} />
            )}
          </div>
          {isSet && colors.length > 0 && (
            <SelectField label="Colour" placeholder="Decide at the salon" value={color}
              options={colors.map((c) => ({ value: c, label: colorLabel(c) }))} onChange={(e) => setColor(e.target.value)} />
          )}
          {addOns.length > 0 && (
            <Field label="Nail art (add-ons, per nail)">
              {() => (
                <div className="nb-addons">
                  {addOns.map((a) => (
                    <label key={a.id} className="nb-addon">
                      <span>{a.name} <span className="muted small">₱{a.price}/nail</span></span>
                      <input className="input input-compact" type="number" min="0" max="10" aria-label={`Nails with ${a.name}`}
                        value={nails[a.id] ?? 0} onChange={(e) => setNails((n) => ({ ...n, [a.id]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }))} />
                    </label>
                  ))}
                </div>
              )}
            </Field>
          )}
        </section>

        <section className="nb-section" aria-label="Date and time">
          <h3>Date and time</h3>
          <div className="grid-2">
            <DayPicker label="Date" required min={today()} value={date} onChange={(value) => { if (value) { setDate(value); setTime('') } }} />
            <SelectField label="Time" required placeholder={!service ? 'Choose a service first' : slots.loading ? 'Loading times…' : openTimes.length ? 'Choose a time' : 'No open times this day'}
              options={openTimes.map((s) => ({ value: s.startTime, label: `${formatTime(s.startTime)} – ${formatTime(s.endTime)}` }))}
              value={time} error={errors.startTime ?? errors.bookingDate} disabled={!service || !openTimes.length} onChange={(e) => setTime(e.target.value)} />
          </div>
          <TextField label="Note (optional)" maxLength={LIMITS.noteMax - 30} value={note} placeholder="e.g. Short almond, first visit" onChange={(e) => setNote(e.target.value)} />
        </section>

        <section className="nb-section" aria-label="Payment">
          <h3>Payment received</h3>
          <div className="grid-2">
            <SelectField label="Already paid" options={PAID} value={paid} error={errors.paid} onChange={(e) => setPaid(e.target.value)} />
            {paid !== 'None' && <SelectField label="Paid by" options={METHODS} value={method} onChange={(e) => setMethod(e.target.value)} />}
          </div>
          {paid !== 'None' && method !== 'Cash' && (
            <TextField label="Reference (optional)" maxLength={50} value={reference} error={errors.paymentReference} onChange={(e) => setReference(e.target.value)} />
          )}
          {quote && (
            <dl className="nb-total">
              <div><dt>Total</dt><dd><Money amount={quote.total} /></dd></div>
              <div><dt>{paid === 'None' ? 'To pay at the salon' : 'Left to pay at the salon'}</dt>
                <dd><Money amount={paid === 'Full' ? 0 : paid === 'Deposit' ? quote.balanceDue : quote.total} /></dd></div>
            </dl>
          )}
        </section>
      </form>
    </Modal>
  )
}
