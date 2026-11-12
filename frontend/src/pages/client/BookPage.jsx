import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { api, referenceImageUrl } from '../../api'
import { addMinutesToTime, today } from '../../lib/dates'
import { clearBookingDraft, draftHasProgress, loadBookingDraft, saveBookingDraft } from '../../lib/bookingDraft'
import { ReferenceImagePicker } from '../../components/ReferenceImagePicker'
import { useAsync } from '../../hooks/useAsync'
import { calculateQuote } from '../../lib/pricing'
import { formatDate, formatDuration, formatTime } from '../../lib/format'
import { ApiError, errorMessage } from '../../api/errors'
import { LIMITS, validateHand } from '../../validation/rules'
import { Alert, Button, Card, Money, PageHeader, PageLoader } from '../../components/ui'
import { SlotPicker } from '../../components/SlotPicker'
import { ColorChooser, EMPTY_NAILS, nailsComplete, nailsStarted } from '../../components/ColorPicker'
import { colorFor, colorLabel, perNailText } from '../../lib/shades'
import { PaymentPanel, amountNow, balanceAfter } from '../../components/PaymentPanel'
import { Receipt } from '../../components/Receipt'

const STEPS = ['Service', 'Date & time', 'Summary & payment']
const HANDS = [{ value: 'Left', label: 'Left hand' }, { value: 'Right', label: 'Right hand' }, { value: 'Both', label: 'Both hands' }]
const HAND_LABEL = Object.fromEntries(HANDS.map((h) => [h.value, h.label]))
const SAVE_DELAY_MS = 400

const isRemoval = (service) => service?.category === 'Removal'

// Photos for the Soft Gel services, matched by name (public/img). Services without one show as text only.
const SERVICE_PHOTOS = {
  plain: '/img/service-plain.jpg', 'with design': '/img/service-with-design.jpg', biab: '/img/service-biab.jpg',
  'soft gel extension': '/img/service-soft-gel-extension.jpg',
}
const DESIGN_PHOTO = '/img/service-with-design.jpg'
// Plain first and BIAB last, as on Leyah's price list; anything else (Soft Gel Extension, services added later) between them.
const CARD_ORDER = { plain: 0, biab: 2 }
const cardOrder = (service) => CARD_ORDER[service.name.trim().toLowerCase()] ?? 1
const photoFor = (service) => service.category === 'SoftGel' ? SERVICE_PHOTOS[service.name.trim().toLowerCase()] : undefined

/** "Plain with design" for a design version, otherwise the service's own name ("BIAB"). */
function setName(catalog, service) {
  if (!service) return ''
  const base = service.designOptionOfId ? byId(catalog, service.designOptionOfId) : null
  return base ? `${base.name} with design` : service.name
}
/** "Plain set with design", "BIAB set": how the hints name the chosen set. */
function setPhrase(catalog, service) {
  const base = service?.designOptionOfId ? byId(catalog, service.designOptionOfId) : null
  return base ? `${base.name} set with design` : `${service?.name} set`
}

// An add-on added later on the Services page, without a photo here yet, shows a plain tile rather than the wrong nails.
const ADD_ON_PHOTOS = {
  'french tip': '/img/addon-french-tip.jpg',
  chrome: '/img/addon-chrome.jpg',
  'cat eye polish': '/img/addon-cat-eye.jpg',
  'blooming gel': '/img/addon-blooming-gel.jpg',
  'embossed art': '/img/addon-embossed-art.jpg',
  rhinestone: '/img/addon-rhinestone.jpg',
}
const addOnPhotoFor = (addOn) => ADD_ON_PHOTOS[addOn.name.trim().toLowerCase()]

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3l1.9 5.6a3 3 0 0 0 1.9 1.9L21.4 12l-5.6 1.5a3 3 0 0 0-1.9 1.9L12 21l-1.9-5.6a3 3 0 0 0-1.9-1.9L2.6 12l5.6-1.5a3 3 0 0 0 1.9-1.9z" />
  </svg>
)

/**
 * "Book again" from the profile: a new draft with the same set, removal, colour and Stones as an earlier booking, keeping
 * only what is still offered. Date, time, note and photos start empty.
 */
function repeatDraft(catalog, booking) {
  const active = (id) => catalog.services.find((s) => s.id === id)
  const set = active(booking.serviceId)
  const softGel = set && !isRemoval(set) ? set : null
  const removal = active(booking.removalServiceId ?? (set && isRemoval(set) ? set.id : null)) ?? null
  const stones = softGel?.allowsAddOns ? booking.addOns.filter((a) => catalog.addOns.some((x) => x.id === a.addOnId)) : []
  return {
    step: 0, serviceId: softGel?.id ?? null, removalId: removal?.id ?? null,
    color: softGel && (catalog.nailColors ?? []).includes(booking.nailColor) ? booking.nailColor : '',
    perNail: softGel && booking.perNailColors ? listedNails(catalog, booking.perNailColors) : EMPTY_NAILS,
    nails: Object.fromEntries(stones.map((a) => [a.addOnId, a.nailCount])),
    hands: Object.fromEntries(stones.map((a) => [a.addOnId, a.hand])),
    date: '', time: '', noteText: '', referenceImages: [], savedAt: `repeat-${booking.id}`, repeatOf: booking,
  }
}

/** An earlier booking's colours per nail, keeping only shades still on the chart. */
function listedNails(catalog, nails) {
  const listed = (c) => (c && (catalog.nailColors ?? []).includes(c) ? c : null)
  const hand = (list) => Array.from({ length: 5 }, (_, i) => listed(list?.[i]))
  return { left: hand(nails.left), right: hand(nails.right) }
}

export default function BookPage() {
  // "Book again" arrives with the earlier booking; it is used once, so a reload continues the saved draft instead.
  const location = useLocation()
  const navigate = useNavigate()
  const [repeat, setRepeat] = useState(() => location.state?.repeat ?? null)
  useEffect(() => {
    if (location.state?.repeat) navigate(location.pathname, { replace: true, state: null })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A saved draft is checked against what is offered now: photos removed or used elsewhere, add-ons no longer
  // offered and dates that have passed are dropped. Prices always come from the current price list.
  const data = useAsync(async () => {
    const [catalog, lookups, draft] = await Promise.all([api.catalog.get(), api.catalog.lookups(), loadBookingDraft()])
    if (repeat) return { catalog, lookups, draft: repeatDraft(catalog, repeat) }
    if (!draftHasProgress(draft)) return { catalog, lookups, draft: null }
    const pending = draft.referenceImages?.length || draft.colorImages?.length ? await api.referenceImages.pending().catch(() => []) : []
    const keep = (saved = []) => saved.filter((image) => pending.some((p) => p.id === image.id))
      .map((image) => ({ ...pending.find((p) => p.id === image.id), name: image.name }))
    const stillPending = keep(draft.referenceImages)
    const offered = (id) => catalog.addOns.some((a) => String(a.id) === String(id))
    const nails = Object.fromEntries(Object.entries(draft.nails ?? {}).filter(([id]) => offered(id)))
    const expired = draft.date && draft.date < today()
    return { catalog, lookups, draft: { ...draft, nails, referenceImages: stillPending, colorImages: keep(draft.colorImages), ...(expired && { date: '', time: '', step: Math.min(draft.step, 1) }) } }
  }, [])
  if (data.loading) return <PageLoader label="Loading services…" />
  if (data.error) return <Alert kind="error">{errorMessage(data.error)}</Alert>
  // Start over forgets the repeated visit too, so the page really starts empty.
  return <BookingWizard key={data.data.draft?.savedAt ?? 'new'} {...data.data} onStartOver={() => { setRepeat(null); data.reload() }} />
}

const byId = (catalog, id) => catalog.services.find((s) => s.id === id)

// Older drafts kept a removal booked on its own as the service; it now has its own field.
const draftService = (catalog, draft) => (isRemoval(byId(catalog, draft?.serviceId)) ? null : draft?.serviceId ?? null)
const draftRemoval = (catalog, draft) => draft?.removalId ?? (isRemoval(byId(catalog, draft?.serviceId)) ? draft.serviceId : null)

function BookingWizard({ catalog, lookups, draft, onStartOver }) {
  const [step, setStep] = useState(draft?.step ?? 0)
  const [serviceId, setServiceId] = useState(() => draftService(catalog, draft)) // the new set (Soft Gel), if any
  const [removalId, setRemovalId] = useState(() => draftRemoval(catalog, draft)) // a removal, on its own or before the set
  const [color, setColor] = useState(draft?.color ?? '')
  const [perNail, setPerNail] = useState(draft?.perNail ?? EMPTY_NAILS) // a colour for each nail (optional)
  const [colorRequest, setColorRequest] = useState(draft?.colorRequest ?? null) // "Can't find your colour?" text; null when not asked
  const [colorImages, setColorImages] = useState(draft?.colorImages ?? []) // at most one photo of that colour
  const [nails, setNails] = useState(draft?.nails ?? {}) // addOnId → nail count
  const [hands, setHands] = useState(draft?.hands ?? {}) // addOnId → 'Left' | 'Right' | 'Both'
  const [date, setDate] = useState(draft?.date ?? '')
  const [time, setTime] = useState(draft?.time ?? '')
  const [note, setNote] = useState(draft?.noteText ?? '')
  const [referenceImages, setReferenceImages] = useState(draft?.referenceImages ?? [])
  const [restored, setRestored] = useState(Boolean(draft))
  const [stepError, setStepError] = useState(null)
  const [payError, setPayError] = useState(null)
  const [result, setResult] = useState(null)
  const [paymentOption, setPaymentOption] = useState('Deposit') // 'Deposit' | 'Full'

  // Every change is saved to the client's account as a Draft (shortly after the last change, and straight away
  // when leaving the page), so going back a step, leaving, or switching device never loses a booking in progress.
  const values = {
    step, serviceId, removalId, color, perNail, colorRequest, nails, hands, date, time, noteText: note,
    referenceImages: referenceImages.map(({ id, name }) => ({ id, name })), colorImages: colorImages.map(({ id, name }) => ({ id, name })),
  }
  const valuesKey = JSON.stringify(values)
  const unsaved = useRef(null)
  const saving = useRef(Promise.resolve())
  const flush = useCallback(() => {
    const json = unsaved.current
    unsaved.current = null
    if (json) {
      // A failed save is not shown: the booking still works, it just isn't restored later.
      saving.current = saveBookingDraft(JSON.parse(json)).catch(() => {})
    }
    return saving.current
  }, [])

  useEffect(() => {
    if (result || !draftHasProgress(JSON.parse(valuesKey))) return undefined
    unsaved.current = valuesKey
    const timer = setTimeout(flush, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [valuesKey, result, flush])
  useEffect(() => flush, [flush]) // leaving the page saves straight away

  const startOver = async () => {
    unsaved.current = null
    await saving.current
    // Photos uploaded for this draft are removed from the server too.
    await Promise.all([...referenceImages, ...colorImages].map((image) => api.referenceImages.remove(image.id).catch(() => {})))
    await clearBookingDraft()
    onStartOver()
  }

  const softGel = byId(catalog, serviceId)
  const removal = byId(catalog, removalId)
  // What is booked: the new set with the removal before it, or the removal on its own.
  const service = softGel ?? removal
  const removalFirst = softGel ? removal : null
  const durationMinutes = (service?.durationMinutes ?? 0) + (removalFirst?.durationMinutes ?? 0)
  const colors = catalog.nailColors ?? []
  const needsColor = Boolean(softGel) && colors.length > 0
  const selectedAddOns = softGel?.allowsAddOns
    ? catalog.addOns.filter((a) => nails[a.id]).map((addOn) => ({ addOn, nailCount: nails[addOn.id] }))
    : []
  // Recalculated on every change to the services or add-ons (Ref 10.4).
  const quote = calculateQuote(service, selectedAddOns, catalog.depositAmount, removalFirst)
  // The total and the review name the set the way it was chosen ("Plain with design").
  const shownQuote = { ...quote, lines: quote.lines.map((l) => (l.category === 'SoftGel' ? { ...l, name: setName(catalog, byId(catalog, l.itemId)) || l.name } : l)) }
  // How the colour reads in the total and the summary: the chart shade, the request, or "one per nail".
  const colorText = colorRequest !== null
    ? (colorRequest.trim() ? `Colour request: ${colorRequest.trim()}` : null)
    : [color && colorLabel(color), nailsComplete(perNail) && `Each nail: ${perNailText(perNail)}`].filter(Boolean).join(' · ') || null

  // One key per set of booking details: repeated or retried Pay clicks for the same booking are
  // recognised by the server and never charged twice (Ref 12.4).
  const detailsKey = JSON.stringify([serviceId, removalId, color, perNail, colorRequest, colorImages.map((r) => r.id), nails, hands, date, time, note,
    paymentOption, referenceImages.map((r) => r.id)])
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [detailsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Which times are free depends on how long the appointment takes, so a different service needs the time chosen again.
  // A service without add-ons (Plain) clears any chosen, so they are never charged or sent.
  const chooseService = (id) => {
    if (id !== serviceId) setTime('')
    if (!byId(catalog, id)?.allowsAddOns) {
      setNails({})
      setHands({})
    }
    if (!id) {
      setColor('')
      setColorRequest(null)
      setPerNail(EMPTY_NAILS)
    }
    setServiceId(id)
  }
  const chooseRemoval = (id) => {
    if (id !== removalId) setTime('')
    setRemovalId(id)
  }

  const back = () => {
    setStepError(null)
    setStep((s) => s - 1)
  }

  const handProblem = () => {
    for (const { addOn, nailCount } of selectedAddOns) {
      const problem = validateHand(hands[addOn.id], nailCount)
      if (problem) return `${addOn.name}: ${problem}`
    }
    return null
  }

  const colorProblem = () => {
    if (!needsColor) return null
    if (colorRequest !== null) return colorRequest.trim() ? null : "Describe the colour you're looking for, or pick one from the chart."
    if (nailsStarted(perNail) && !nailsComplete(perNail)) return 'Choose a colour for all 10 nails, or clear the colours for each nail.'
    return color || nailsComplete(perNail) ? null : 'Choose a nail colour to continue.'
  }

  const next = () => {
    const problem = [
      (!service && 'Choose a service to continue.') || colorProblem() || handProblem(),
      (!date || !time) && 'Choose a date and an available time.',
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
    await flush() // the latest draft is on the server before the booking replaces it
    try {
      const response = await api.bookings.create({
        serviceId: service.id, removalServiceId: removalFirst?.id ?? null, nailColor: needsColor && colorRequest === null && color ? color : null,
        perNailColors: needsColor && nailsComplete(perNail) ? perNail : null,
        colorRequest: needsColor && colorRequest !== null ? colorRequest.trim() : null,
        colorRequestImageId: needsColor && colorRequest !== null ? colorImages[0]?.id ?? null : null,
        termsVersion: catalog.termsVersion,
        addOns: selectedAddOns.map((a) => ({ addOnId: a.addOn.id, nailCount: a.nailCount, hand: hands[a.addOn.id] ?? 'Both' })),
        bookingDate: date, startTime: time, note: note.trim() || null, paymentMethod, paymentOption, depositAcknowledged: true, idempotencyKey,
        referenceImageIds: referenceImages.map((r) => r.id),
      })
      // The server deleted the draft together with creating the booking.
      setResult(response)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slot_unavailable') {
        setTime('')
        setStep(1)
        setStepError(err.message)
      } else if (err instanceof ApiError && err.code === 'terms_outdated') {
        setPayError(`${err.message} Reload the page to see the new version.`)
      } else if (err instanceof ApiError && err.code === 'image_unavailable') {
        setStep(0)
        setStepError(err.message)
      } else {
        setPayError(errorMessage(err))
      }
    }
  }

  if (result) {
    return (
      <div className="narrow stack">
        <PageHeader title="Booking received!"
          subtitle={`Your payment went through. Leyah will confirm your ${formatDate(result.booking.bookingDate)}, ${formatTime(result.booking.startTime)} appointment shortly.`} />
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
      {restored && draft?.repeatOf && (
        <Alert kind="info" onClose={() => setRestored(false)}>
          We filled in the same set as your visit on {formatDate(draft.repeatOf.bookingDate)}. Check it, then pick a date and time.
          Prices are today&apos;s.{' '}
          <button type="button" className="link-button" onClick={startOver}>Start over</button>
        </Alert>
      )}
      {restored && !draft?.repeatOf && (
        <Alert kind="info" onClose={() => setRestored(false)}>
          We restored the booking you saved as a draft{referenceImages.length > 0 ? ', including your design photos' : ''}.
          Prices and times are checked again before you pay.{' '}
          <button type="button" className="link-button" onClick={startOver}>Start over</button>
        </Alert>
      )}
      <ol className="stepper" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="step-number">{i + 1}</span> <span className="step-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="booking-layout">
        <Card className={step === 2 ? 'booking-main booking-main-wide' : 'booking-main'}>
          {step > 0 && (
            <button type="button" className="step-back" onClick={back}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 18l-6-6 6-6" /></svg>
              Back to {STEPS[step - 1].toLowerCase()}
            </button>
          )}
          {stepError && <Alert kind="error">{stepError}</Alert>}
          {step === 0 && (
            <ServiceStep catalog={catalog} serviceId={serviceId} onService={chooseService} removalId={removalId} onRemoval={chooseRemoval}
              color={color} onColor={setColor} perNail={perNail} onPerNail={setPerNail}
              colorRequest={colorRequest} onColorRequest={setColorRequest} colorImages={colorImages} onColorImages={setColorImages}
              referenceImages={referenceImages} onReferenceImages={setReferenceImages}
              nails={nails} onNails={setNails} hands={hands} onHands={setHands} />
          )}
          {step === 1 && (
            <div className="stack">
              <SlotPicker date={date} onDateChange={setDate} selectedTime={time} onTimeChange={setTime} serviceId={service?.id}
                removalServiceId={removalFirst?.id} />
              <NoteStep suggestions={lookups.noteSuggestions} value={note} onChange={setNote} />
            </div>
          )}
          {step === 2 && (
            <div className="review-step">
              <div className="pick-column">
                <h2 className="pick-title">Booking summary</h2>
                <Review quote={shownQuote} option={paymentOption} hands={hands} durationMinutes={durationMinutes} color={needsColor ? colorText : null}
                  date={date} time={time} note={note.trim()}
                  referenceImages={referenceImages} onEdit={(target) => { setStepError(null); setStep(target) }} />
              </div>
              <div className="pick-column">
                <h2 className="pick-title">Payment</h2>
                <div className="pick-card">
                  <PaymentPanel quote={quote} option={paymentOption} onOptionChange={setPaymentOption} onPay={pay} error={payError} />
                </div>
              </div>
            </div>
          )}
        </Card>

        {step < 2 && (
          <aside className="booking-aside">
            <Card title="Your total" className="your-total">
              <Summary quote={shownQuote} hands={hands} color={needsColor ? colorText : null} swatchOf={needsColor && colorRequest === null ? color : null} durationMinutes={durationMinutes} date={date} time={time} />
              {/* The way forward sits under the total; going back is the "← Back to…" link at the top of each step.
                  On phones it becomes a bar fixed to the bottom of the screen. */}
              <div className="summary-next">
                <Button onClick={next}>
                  Next: {STEPS[step + 1]}
                  <svg className="summary-next-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </Button>
              </div>
            </Card>
          </aside>
        )}
      </div>
    </div>
  )
}


/** One tappable service card. A second tap on the chosen card un-chooses it. */
function ServiceCard({ service, selected, onToggle, name }) {
  const photo = photoFor(service)
  return (
    <label className={`${selected ? 'choice selected' : 'choice'}${photo ? ' has-photo' : ''}`}>
      {photo && <img className="choice-photo" src={photo} alt="" width="640" height="640" loading="lazy" />}
      <input type="checkbox" name={name} checked={selected} onChange={() => onToggle(selected ? null : service.id)} />
      <span className="choice-name">{service.name}</span>
      <span className="choice-facts">
        <Money amount={service.price} />
        {service.durationMinutes && <span className="choice-meta muted">{formatDuration(service.durationMinutes)}</span>}
      </span>
    </label>
  )
}

/**
 * Design (optional): one "With Design" card for every set that has a design version. It adds the design to the chosen set
 * (Plain becomes With Design, BIAB becomes BIAB with Design); with nothing chosen yet it starts with Plain.
 */
function DesignOption({ cards, chosen, baseOf, designOf, onService, children }) {
  const base = baseOf(chosen)
  const fallback = cards.map(designOf).find(Boolean)
  if (!fallback) return null
  const design = base ? designOf(base) : fallback
  const on = Boolean(chosen?.designOptionOfId)
  const hint = !base ? 'Add a design to your Plain or BIAB set.'
    : design ? `Adds a design to your ${base.name} set.` : `Designs aren't available with ${base.name}.`
  return (
    <div className="service-group">
      <h3 className="group-title">Design <span className="group-optional">(optional)</span></h3>
      {/* The With Design card, with the design photos beside it; each column has one line above it so both line up. */}
      <div className="design-row">
        <div className="pick-column design-card">
          <div className="pick-title-row"><span className="muted small">{hint}</span></div>
          <label className={`choice has-photo${on ? ' selected' : ''}${design ? '' : ' is-disabled'}`}>
          <img className="choice-photo" src={DESIGN_PHOTO} alt="" width="640" height="640" loading="lazy" />
          <input type="checkbox" name="design" checked={on} disabled={!design}
            onChange={() => onService(on ? base.id : design.id)} />
          <span className="choice-name">With Design</span>
          <span className="choice-facts">
            <Money amount={(design ?? fallback).price} />
            {(design ?? fallback).durationMinutes && <span className="choice-meta muted">{formatDuration((design ?? fallback).durationMinutes)}</span>}
          </span>
          </label>
        </div>
        {children}
      </div>
    </div>
  )
}

function ServiceStep({
  catalog, serviceId, onService, removalId, onRemoval, color, onColor, perNail, onPerNail, colorRequest, onColorRequest, colorImages, onColorImages,
  referenceImages, onReferenceImages, nails, onNails, hands, onHands,
}) {
  const softGels = catalog.services.filter((s) => s.category === 'SoftGel')
  // The "with design" versions (Plain with design, BIAB with design) share one "With Design" card under Optional,
  // which adds the design to whichever set is chosen.
  const designOf = (base) => base && softGels.find((s) => s.designOptionOfId === base.id)
  const cards = softGels.filter((s) => !s.designOptionOfId).sort((a, b) => cardOrder(a) - cardOrder(b))
  const removals = catalog.services.filter((s) => s.category === 'Removal')
  const softGel = byId(catalog, serviceId)
  const colors = catalog.nailColors ?? []
  const addOnsAllowed = Boolean(softGel?.allowsAddOns)
  // The counter goes down to 1 nail; the × beside it removes the add-on.
  const setCount = (id, count) => {
    onNails((current) => {
      const nextCounts = { ...current }
      if (count <= 0) delete nextCounts[id]
      else nextCounts[id] = Math.min(LIMITS.maxNailsPerAddOn, count)
      return nextCounts
    })
    if (count <= 0) onHands((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== String(id))))
  }
  // Choosing a hand fills its nails: both hands is all 10, one hand is 5. The counter can then lower it for an
  // accent on only some nails.
  const nailsFor = (hand) => (hand === 'Both' ? LIMITS.maxNailsPerAddOn : LIMITS.maxNailsPerHand)
  const setHand = (id, hand) => {
    onHands((current) => ({ ...current, [id]: hand }))
    setCount(id, nailsFor(hand))
  }
  // Both hands is the usual choice, so a new add-on starts there, on all 10 nails.
  const toggleAddOn = (id, on) => (on ? setHand(id, 'Both') : setCount(id, 0))
  // One hand has five nails, so Left or Right stops the counter at 5.
  const maxFor = (id) => (hands[id] === 'Left' || hands[id] === 'Right' ? LIMITS.maxNailsPerHand : LIMITS.maxNailsPerAddOn)
  const chosen = catalog.addOns.filter((a) => nails[a.id] > 0)
  const baseOf = (service) => (service?.designOptionOfId ? byId(catalog, service.designOptionOfId) : service)

  return (
    <div className="stack">
      <fieldset className="choice-fieldset">
        <legend className="step-heading">
          <span><h2>Choose a service</h2><span className="step-hint">A new set, a removal, or both in one appointment.</span></span>
        </legend>
        <div className="service-group">
          <h3 className="group-title">Services</h3>
          <div className="choice-grid service-photos">
            {cards.map((s) => (
              <ServiceCard key={s.id} name="service" service={s} selected={baseOf(softGel)?.id === s.id} onToggle={onService} />
            ))}
          </div>
        </div>
        <DesignOption cards={cards} chosen={softGel} baseOf={baseOf} designOf={designOf} onService={onService}>
          <ReferenceImagePicker images={referenceImages} onChange={onReferenceImages} optional={false} />
        </DesignOption>
        {removals.length > 0 && (
          <div className="service-group">
            <h3 className="group-title">Removal</h3>
            <p className="muted small addon-note">
              {softGel ? `Taken off first, then your ${setPhrase(catalog, softGel)}, in the same appointment.` : 'On its own, or add it before a new set.'}
            </p>
            <div className="choice-grid service-compact">
              {removals.map((s) => <ServiceCard key={s.id} name="removal" service={s} selected={removalId === s.id} onToggle={onRemoval} />)}
            </div>
          </div>
        )}
      </fieldset>

      {softGel && colors.length > 0 && (
        <fieldset className="choice-fieldset">
          <legend className="step-heading">
            <span><h2>Choose a colour</h2><span className="step-hint">Pick a shade from the colour chart for your {setPhrase(catalog, softGel)}.</span></span>
          </legend>
          <div className="stack">
            <ColorChooser colors={colors} value={colorRequest === null ? color : ''}
              onChange={(c) => { onColorRequest(null); onColor(c) }}
              request={colorRequest} onRequest={(text) => { onColor(''); onColorRequest(text) }}
              nails={perNail} onNails={onPerNail} outOfStock={catalog.outOfStockColors ?? []} />
            {colorRequest !== null && (
              <ColorRequestPhoto images={colorImages} onImages={onColorImages} />
            )}
          </div>
        </fieldset>
      )}

      <fieldset className="choice-fieldset" disabled={!addOnsAllowed}>
        <legend className="step-heading">
          <span><h2>Nail Art (add-ons)</h2><span className="step-hint">Optional · priced per nail, so choose as many as you like.</span></span>
        </legend>
        {!addOnsAllowed && (
          <p className="muted small addon-note">
            {softGel ? `Nail art isn't available with ${baseOf(softGel)?.name ?? softGel.name} on its own. Tick "With Design" or choose another service to add it.`
              : 'Choose a service to add nail art.'}
          </p>
        )}
        <div className={addOnsAllowed ? 'addon-list' : 'addon-list is-disabled'}>
          {catalog.addOns.map((a) => {
            const photo = addOnPhotoFor(a)
            const count = addOnsAllowed ? nails[a.id] ?? 0 : 0
            return (
              <label key={a.id} className={count ? 'addon addon-check selected' : 'addon addon-check'}>
                {photo
                  ? <img className="addon-photo" src={photo} alt="" width="640" height="640" loading="lazy" />
                  : <span className="addon-photo addon-photo-empty"><SparkleIcon /></span>}
                <input type="checkbox" checked={count > 0} onChange={(e) => toggleAddOn(a.id, e.target.checked)} />
                <span className="addon-name">{a.name}</span>
                <span className="muted small"><Money amount={a.price} /> / nail</span>
              </label>
            )
          })}
        </div>

        {addOnsAllowed && chosen.length > 0 && (
          <div className="addon-panel">
            <h3>Your add-ons</h3>
            <ul>
              {chosen.map((a) => {
                const count = nails[a.id]
                const hand = hands[a.id]
                const photo = addOnPhotoFor(a)
                return (
                  <li key={a.id} className="addon-row">
                    <div className="addon-row-title">
                      {photo
                        ? <img src={photo} alt="" width="640" height="640" loading="lazy" />
                        : <span className="addon-row-empty"><SparkleIcon /></span>}
                      <strong>{a.name}</strong>
                    </div>
                    <div className={hand ? 'hand-choice' : 'hand-choice needs-choice'} role="radiogroup" aria-label={`Which hand for ${a.name}`}>
                      {HANDS.map((h) => (
                        <button key={h.value} type="button" role="radio" aria-checked={hand === h.value}
                          title={`${nailsFor(h.value)} nails`}
                          className={hand === h.value ? 'hand-option selected' : 'hand-option'} onClick={() => setHand(a.id, h.value)}>
                          {h.label}
                        </button>
                      ))}
                    </div>
                    <div className="counter" role="group" aria-label={`Number of nails for ${a.name}`}>
                      <button type="button" onClick={() => setCount(a.id, count - 1)} disabled={count <= 1} aria-label={`Fewer nails for ${a.name}`}>−</button>
                      <output aria-live="polite">{count} {count === 1 ? 'nail' : 'nails'}</output>
                      <button type="button" onClick={() => setCount(a.id, count + 1)} disabled={count >= maxFor(a.id)}
                        aria-label={`More nails for ${a.name}`}>+</button>
                    </div>
                    <Money amount={a.price * count} />
                    <button type="button" className="addon-remove" onClick={() => setCount(a.id, 0)} aria-label={`Remove ${a.name}`}>×</button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </fieldset>
    </div>
  )
}

/** A photo of the colour asked for in the chart's "Can't find your colour?" (optional): it helps Leyah match the shade. */
function ColorRequestPhoto({ images, onImages }) {
  return (
    <ReferenceImagePicker images={images} onChange={onImages} max={1} compact title="Photo of the colour" photoName="colour photo"
      hint="Helps Leyah match the shade · JPG, PNG or WebP" />
  )
}

/** "Note for Leyah": the client types anything they'd like her to know; the suggestions add common notes in one tap. */
function NoteStep({ suggestions, value, onChange }) {
  const has = (text) => value.toLowerCase().includes(text.toLowerCase())
  const add = (text) => {
    if (has(text)) return
    const start = value.trimEnd()
    const joined = start ? `${start}${/[.!?]$/.test(start) ? '' : '.'} ${text}` : text
    onChange(joined.slice(0, LIMITS.noteMax))
  }
  return (
    <div className="pick-column">
      <div className="pick-title-row">
        <label htmlFor="booking-note" className="field-label pick-title">Note for Leyah <span className="pick-optional">(optional)</span></label>
        <span className="field-counter" aria-live="polite">{value.length}/{LIMITS.noteMax}</span>
      </div>
      <div className="pick-card">
        <textarea id="booking-note" className="input textarea" rows={3} maxLength={LIMITS.noteMax} value={value} aria-describedby="booking-note-hint"
          placeholder="e.g. Short almond nails please, it's my first visit." onChange={(e) => onChange(e.target.value)} />
        <div className="slot-group-title note-quick-title">Quick add</div>
        <div className="note-chips">
          {suggestions.map((text) => (
            <button key={text} type="button" className={has(text) ? 'chip selected' : 'chip'}
              aria-pressed={has(text)} onClick={() => add(text)}>
              {has(text) ? '✓ ' : '+ '}{text}
            </button>
          ))}
        </div>
        <p className="pick-hint" id="booking-note-hint">Nail shape or length, allergies, a special occasion, anything that helps Leyah prepare</p>
      </div>
    </div>
  )
}

/** Service, add-ons, total and the required deposit (Ref 10.2). */
// "Removal – My Work"; the set ("Plain with design") and add-ons keep their own name.
function totalLineName(line) {
  if (line.category === 'Removal') return /^Removal \(/.test(line.name) ? line.name.replace(/^Removal \((.*)\)$/, 'Removal – $1') : `Removal – ${line.name}`
  return line.name
}
// The main service first, then the removal and Stones, as on the price list.
const LINE_ORDER = { Removal: 1, Stone: 2 }

const SummaryIcon = ({ children }) => (
  <svg className="yt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
)

/** The "Your total" card beside each step: prices, total, deposit and balance, then time, colour and appointment. */
function Summary({ quote, hands = {}, color, swatchOf, durationMinutes, date, time }) {
  if (!quote.lines.length) return <p className="muted">Choose a service to see your total.</p>
  const lines = [...quote.lines].sort((a, b) => (LINE_ORDER[a.category] ?? 0) - (LINE_ORDER[b.category] ?? 0))
  const swatch = swatchOf ? colorFor(swatchOf) : null
  return (
    <div className="yt">
      <ul className="yt-lines">
        {lines.map((line) => (
          <li key={`${line.category}-${line.itemId}`}>
            <span>
              {totalLineName(line)}
              {line.category === 'Stone' && (
                <span className="yt-sub">
                  {hands[line.itemId] && `${HAND_LABEL[hands[line.itemId]]} · `}{line.quantity} {line.quantity === 1 ? 'nail' : 'nails'}
                </span>
              )}
            </span>
            <Money amount={line.lineTotal} />
          </li>
        ))}
      </ul>
      <div className="yt-total"><span>Total</span><Money amount={quote.total} /></div>
      <div className="yt-pay">
        <div className="yt-deposit"><span>Deposit due now</span><Money amount={quote.deposit} /></div>
        <div className="yt-balance"><span>Balance at the salon</span><Money amount={quote.balanceDue} /></div>
      </div>
      <dl className="yt-facts">
        {durationMinutes > 0 && (
          <div>
            <dt><SummaryIcon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></SummaryIcon>Estimated time</dt>
            <dd>~ {formatDuration(durationMinutes)}</dd>
          </div>
        )}
        {color && (
          <div>
            <dt><SummaryIcon><path d="M12 3.5c3 3.6 5.5 6.6 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-9.6z" /></SummaryIcon>Colour</dt>
            <dd className="yt-color">
              <span className={swatch ? 'yt-swatch' : 'yt-swatch yt-swatch-unknown'} style={swatch ? { background: swatch } : undefined} aria-hidden="true" />
              {color}
            </dd>
          </div>
        )}
        {date && time && (
          <div>
            <dt><SummaryIcon><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></SummaryIcon>Appointment</dt>
            <dd title={formatDate(date)}>{formatDate(date).replace(/^\w+, /, '').replace(/, \d{4}$/, '')} · {formatTime(time)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/**
 * The last step: the appointment as a header card, then what is being booked, the note and photos. Each section
 * has a Change link back to the step where it was chosen, so nothing has to be redone from the start.
 */
function Review({ quote, option, hands, durationMinutes, color, date, time, note, referenceImages, onEdit }) {
  const ends = time && durationMinutes ? addMinutesToTime(time, durationMinutes) : null
  const change = (step, what) => (
    <button type="button" className="review-change" onClick={() => onEdit(step)} aria-label={`Change ${what}`}>Change</button>
  )
  return (
    <div className="review">
      <section className="review-section" aria-label="Appointment">
        <div className="review-head"><h3>Appointment</h3>{change(1, 'date and time')}</div>
        <dl className="review-details">
          <dt>Date</dt>
          <dd>{date ? formatDate(date) : 'No date chosen'}</dd>
          <dt>Time</dt>
          <dd>{time ? `${formatTime(time)}${ends ? ` – ${formatTime(ends)}` : ''}` : ''}</dd>
          {durationMinutes > 0 && (
            <>
              <dt>Duration</dt>
              <dd>{formatDuration(durationMinutes)}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="review-section" aria-label="Services">
        <div className="review-head"><h3>Services</h3>{change(0, 'services')}</div>
        <ul className="summary-lines">
          {quote.lines.map((line) => (
            <li key={`${line.category}-${line.itemId}`}>
              <span>
                {line.name}
                {line.category === 'Stone' && hands[line.itemId] && <> — {HAND_LABEL[hands[line.itemId]]}</>}
                {line.pricingUnit === 'per nail' && <span className="muted"> × {line.quantity} {line.quantity === 1 ? 'nail' : 'nails'}</span>}
              </span>
              <Money amount={line.lineTotal} />
            </li>
          ))}
        </ul>
        {color && <p className="review-color"><span className="muted">Colour</span> {color}</p>}
        <div className="summary-total"><span>Total</span><Money amount={quote.total} /></div>
        {/* Follows the payment option chosen below. */}
        <div className="review-split" aria-live="polite">
          <div className="summary-row review-now"><span>{option === 'Full' ? 'Full payment now' : 'Deposit due now'}</span><Money amount={amountNow(quote, option)} /></div>
          <div className="summary-row muted"><span>Balance at the salon</span><Money amount={balanceAfter(quote, option)} /></div>
        </div>
      </section>

      <section className="review-section" aria-label="Design and note">
        <div className="review-head"><h3>Design photos &amp; note</h3></div>
        <dl className="review-details">
          <dt>Note for Leyah {change(1, 'note')}</dt>
          <dd className={note ? 'summary-note' : 'muted'}>{note || 'No note'}</dd>
          <dt>Design photos {change(0, 'design photos')}</dt>
          <dd>
            {referenceImages.length === 0 ? <span className="muted">None</span> : (
              <ul className="reference-thumbs" aria-label="Design reference photos">
                {referenceImages.map((image, i) => (
                  <li key={image.id}><img src={referenceImageUrl(image)} alt={`Design reference ${i + 1}`} /></li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </section>

      {/* The rules most likely to matter later, in the same words as the Terms & Conditions (sections 6 to 8). The deposit rule is beside the Pay button. */}
      <section className="review-section" aria-label="Booking policy">
        <div className="review-head"><h3>Booking policy</h3></div>
        <ul className="policy-list">
          <li>You can reschedule online up to 24 hours before your appointment.</li>
          <li>Cancelling less than 24 hours before, or not showing up, may incur a fee.</li>
          <li>Please arrive on time and come alone, with clean, bare nails unless you booked a removal.</li>
        </ul>
      </section>
    </div>
  )
}
