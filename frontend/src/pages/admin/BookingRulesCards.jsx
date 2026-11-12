import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, fieldErrors } from '../../api/errors'
import { Alert, Button, Card, PageLoader, TextField } from '../../components/ui'
import { NailPair } from '../../components/ColorPicker'
import { colorFor, colorLabel, shadeNumber } from '../../lib/shades'

/**
 * Which chart shades Leyah has. A shade she has run out of shows as "Out of stock" on the client's colour chart and
 * can't be picked; tapping it again puts it back.
 */
export function ColorStockCard() {
  const catalog = useAsync(() => api.admin.services(), [])
  const [outOfStock, setOutOfStock] = useState(null) // updated from each answer; null until the first change
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  if (catalog.loading && !catalog.data) return <Card title="Colour chart stock"><PageLoader label="Loading shades…" /></Card>
  if (catalog.error) return <Card title="Colour chart stock"><Alert kind="error">{errorMessage(catalog.error)}</Alert></Card>

  const shades = (catalog.data.nailColors ?? []).filter((c) => shadeNumber(c))
  const out = outOfStock ?? catalog.data.outOfStockColors ?? []
  const toggle = async (color) => {
    setBusy(color)
    setError(null)
    try {
      const rules = await api.admin.setColorStock(color, out.includes(color))
      setOutOfStock(rules.outOfStockColors)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="Colour chart stock">
      <p className="card-intro">
        Tap a shade you&apos;ve run out of. Clients see it as out of stock and can&apos;t pick it until you tap it again.
        {out.length > 0 && <strong> {out.length} out of stock.</strong>}
      </p>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <ul className="stock-grid" aria-label="Shades">
        {shades.map((c) => {
          const missing = out.includes(c)
          return (
            <li key={c}>
              <button type="button" className={missing ? 'stock-shade is-out' : 'stock-shade'} aria-pressed={!missing} disabled={busy === c}
                title={colorLabel(c)} aria-label={`${colorLabel(c)}: ${missing ? 'out of stock' : 'in stock'}`} onClick={() => toggle(c)}>
                <NailPair color={colorFor(c)} className="stock-nails" />
                <span className="stock-num">{c}</span>
                <span className="stock-state">{missing ? 'Out' : 'In stock'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** The deposit, the reschedule rules and how far ahead clients can book. */
export function BookingRulesCard() {
  const rules = useAsync(() => api.admin.bookingRules(), [])
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (rules.loading && !rules.data) return <Card title="Booking rules"><PageLoader label="Loading rules…" /></Card>
  if (rules.error) return <Card title="Booking rules"><Alert kind="error">{errorMessage(rules.error)}</Alert></Card>

  const current = rules.data
  const values = form ?? {
    depositAmount: String(current.depositAmount), rescheduleMinimumHours: String(current.rescheduleMinimumHours),
    rescheduleLimit: String(current.rescheduleLimit), maxDaysAhead: String(current.maxDaysAhead),
  }
  const set = (key) => (e) => { setSaved(false); setForm({ ...values, [key]: e.target.value }) }
  const dirty = form !== null && Object.entries(values).some(([k, v]) => Number(v) !== current[k])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const next = await api.admin.updateBookingRules(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])))
      rules.setData(next)
      setForm(null)
      setSaved(true)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: Object.keys(fieldErrors(err)).length ? null : errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Booking rules">
      <p className="card-intro">Changes apply to new bookings and new reschedules; bookings already made keep their deposit.</p>
      {errors.form && <Alert kind="error">{errors.form}</Alert>}
      {saved && <Alert kind="success" onClose={() => setSaved(false)}>Booking rules saved.</Alert>}
      <form className="rules-form" onSubmit={save} noValidate>
        <TextField label="Deposit (₱)" type="number" min="0" step="1" value={values.depositAmount} error={errors.depositAmount}
          hint="Paid when booking; non-refundable" onChange={set('depositAmount')} />
        <TextField label="Book up to (days ahead)" type="number" min="7" max="365" value={values.maxDaysAhead} error={errors.maxDaysAhead}
          hint="How far ahead clients can choose a date" onChange={set('maxDaysAhead')} />
        <TextField label="Reschedule at least (hours before)" type="number" min="0" max="168" value={values.rescheduleMinimumHours}
          error={errors.rescheduleMinimumHours} hint="Clients can't move an appointment later than this" onChange={set('rescheduleMinimumHours')} />
        <TextField label="Times a client can reschedule" type="number" min="0" max="10" value={values.rescheduleLimit} error={errors.rescheduleLimit}
          hint="Per booking; 0 means they message you instead" onChange={set('rescheduleLimit')} />
        <div className="rules-actions">
          <Button type="submit" loading={saving} disabled={!dirty}>Save rules</Button>
        </div>
      </form>
    </Card>
  )
}
