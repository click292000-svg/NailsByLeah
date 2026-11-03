import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, fieldErrors } from '../../api/errors'
import { validateDuration, validatePrice, validateServiceName } from '../../validation/rules'
import { Alert, Button, Card, Money, PageHeader, PageLoader, SelectField, TextField } from '../../components/ui'

/** Update prices, service durations and add-ons without code changes (Ref 11.3). */
export default function ServicesPage() {
  const catalog = useAsync(() => api.admin.services(), [])
  const [message, setMessage] = useState(null)

  if (catalog.loading && !catalog.data) return <PageLoader label="Loading services…" />
  if (catalog.error) return <Alert kind="error">{errorMessage(catalog.error)}</Alert>

  const changed = (text) => {
    setMessage(text)
    catalog.reload()
  }

  return (
    <div className="stack">
      <PageHeader title="Services & prices" subtitle="Price and duration changes apply to new bookings. Existing bookings keep the price and length they were booked with. The duration decides which times clients can book." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}

      <Card title="Main services">
        <CatalogTable items={catalog.data.services} kind="service" onChanged={changed} />
        <NewItemForm kind="service" onCreated={changed} />
      </Card>
      <Card title="Stone add-ons (priced per nail)">
        <CatalogTable items={catalog.data.addOns} kind="addOn" onChanged={changed} />
        <NewItemForm kind="addOn" onCreated={changed} />
      </Card>
    </div>
  )
}

function CatalogTable({ items, kind, onChanged }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {kind === 'service' && <th>Category</th>}
            <th>Name</th>
            <th>Price (₱){kind === 'addOn' && ' per nail'}</th>
            {kind === 'service' && <th>Duration (min)</th>}
            <th>Active</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => <CatalogRow key={item.id} item={item} kind={kind} onChanged={onChanged} />)}
        </tbody>
      </table>
    </div>
  )
}

function CatalogRow({ item, kind, onChanged }) {
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(String(item.price))
  const [duration, setDuration] = useState(String(item.durationMinutes ?? ''))
  const [isActive, setIsActive] = useState(item.isActive)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const isService = kind === 'service'
  const dirty = name !== item.name || Number(price) !== item.price || isActive !== item.isActive
    || (isService && Number(duration) !== item.durationMinutes)

  const save = async () => {
    const found = Object.fromEntries([['name', validateServiceName(name)], ['price', validatePrice(price)],
      ['durationMinutes', isService ? validateDuration(duration) : null]].filter(([, m]) => m))
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const body = { name, price: Number(price), isActive }
      if (isService) await api.admin.updateService(item.id, { ...body, durationMinutes: Number(duration) })
      else await api.admin.updateAddOn(item.id, body)
      onChanged(`${name} saved.`)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Remove ${item.name} from the price list? Past bookings are not affected.`)) return
    setSaving(true)
    try {
      if (kind === 'service') await api.admin.deleteService(item.id)
      else await api.admin.deleteAddOn(item.id)
      onChanged(`${item.name} removed.`)
    } catch (err) {
      setErrors({ form: errorMessage(err) })
      setSaving(false)
    }
  }

  return (
    <tr>
      {kind === 'service' && <td data-label="Category">{item.categoryLabel}</td>}
      <td data-label="Name">
        <input className="input input-compact" aria-label={`Name of ${item.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {errors.name && <div className="field-error">{errors.name}</div>}
      </td>
      <td data-label="Price">
        <input className="input input-compact input-price" type="number" min="0" step="1" aria-label={`Price of ${item.name}`}
          value={price} onChange={(e) => setPrice(e.target.value)} />
        {errors.price && <div className="field-error">{errors.price}</div>}
        {!errors.price && Number(price) !== item.price && <div className="muted small">was <Money amount={item.price} /></div>}
      </td>
      {isService && (
        <td data-label="Duration">
          <input className="input input-compact input-price" type="number" min="15" max="480" step="5" aria-label={`Duration of ${item.name} in minutes`}
            value={duration} onChange={(e) => setDuration(e.target.value)} />
          {errors.durationMinutes && <div className="field-error">{errors.durationMinutes}</div>}
        </td>
      )}
      <td data-label="Active">
        <input type="checkbox" aria-label={`${item.name} is offered`} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </td>
      <td className="actions-cell">
        <div className="row-actions">
          <Button size="sm" disabled={!dirty} loading={saving} onClick={save}>Save</Button>
          <Button variant="danger-ghost" size="sm" disabled={saving} onClick={remove}>Remove</Button>
        </div>
        {errors.form && <div className="field-error">{errors.form}</div>}
      </td>
    </tr>
  )
}

const CATEGORIES = [
  { value: 'SoftGel', label: 'Soft Gel' },
  { value: 'Removal', label: 'Removal' },
]

function NewItemForm({ kind, onCreated }) {
  const [category, setCategory] = useState('SoftGel')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('60')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const found = Object.fromEntries([['name', validateServiceName(name)], ['price', validatePrice(price)],
      ['durationMinutes', kind === 'service' ? validateDuration(duration) : null]].filter(([, m]) => m))
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      if (kind === 'service') await api.admin.createService({ category, name, price: Number(price), durationMinutes: Number(duration) })
      else await api.admin.createAddOn({ name, price: Number(price) })
      setName('')
      setPrice('')
      onCreated(`${name} added to the price list.`)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: Object.keys(fieldErrors(err)).length ? null : errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="inline-form" onSubmit={submit} noValidate>
      <h3>Add {kind === 'service' ? 'a service' : 'an add-on'}</h3>
      {errors.form && <Alert kind="error">{errors.form}</Alert>}
      <div className="inline-form-fields">
        {kind === 'service' && <SelectField label="Category" value={category} options={CATEGORIES} onChange={(e) => setCategory(e.target.value)} />}
        <TextField label="Name" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <TextField label={kind === 'addOn' ? 'Price per nail (₱)' : 'Price (₱)'} type="number" min="0" value={price} error={errors.price}
          onChange={(e) => setPrice(e.target.value)} />
        {kind === 'service' && (
          <TextField label="Duration (minutes)" type="number" min="15" max="480" step="5" value={duration} error={errors.durationMinutes}
            onChange={(e) => setDuration(e.target.value)} />
        )}
        <Button type="submit" loading={saving}>Add</Button>
      </div>
    </form>
  )
}
