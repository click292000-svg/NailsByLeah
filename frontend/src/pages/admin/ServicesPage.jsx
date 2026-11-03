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

  // Main services are listed under their category (Soft Gel, Removal) instead of repeating it on every row.
  const groups = [...new Set(catalog.data.services.map((s) => s.category))]
    .map((value) => {
      const items = catalog.data.services.filter((s) => s.category === value)
      return { value, label: items[0].categoryLabel, items }
    })

  return (
    <div className="stack-lg">
      <PageHeader title="Services & prices" subtitle="Changes apply to new bookings only; existing bookings keep their price and length. The length decides which times clients can book." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}

      <Card title="Main services">
        <p className="card-intro">The price and appointment length of each service.</p>
        <div className="catalog">
          <CatalogHead kind="service" />
          {groups.map((g) => (
            <section key={g.value} className="catalog-group" aria-label={g.label}>
              <h3 className="list-group-title">{g.label}<span>{g.items.length}</span></h3>
              {g.items.map((item) => <CatalogRow key={item.id} item={item} kind="service" onChanged={changed} />)}
            </section>
          ))}
        </div>
        <NewItemForm kind="service" onCreated={changed} />
      </Card>

      <Card title="Stone add-ons">
        <p className="card-intro">Priced per nail and added to a Soft Gel service.</p>
        <div className="catalog">
          <CatalogHead kind="addOn" />
          {catalog.data.addOns.map((item) => <CatalogRow key={item.id} item={item} kind="addOn" onChanged={changed} />)}
        </div>
        <NewItemForm kind="addOn" onCreated={changed} />
      </Card>
    </div>
  )
}

/** Column titles. Both lists use the same columns, so prices line up from one card to the next. */
function CatalogHead({ kind }) {
  return (
    <div className="catalog-head" aria-hidden="true">
      <span>Name</span>
      <span>{kind === 'addOn' ? 'Price per nail' : 'Price'}</span>
      <span>{kind === 'service' ? 'Length' : ''}</span>
      <span>Offered</span>
      <span />
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
    <div className={`catalog-row${dirty ? ' is-dirty' : ''}${isActive ? '' : ' is-inactive'}`}>
      <div className="catalog-cell catalog-name">
        <input className="input input-compact" aria-label={`Name of ${item.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {errors.name && <div className="field-error">{errors.name}</div>}
      </div>
      <div className="catalog-cell" data-label={isService ? 'Price' : 'Price per nail'}>
        <div className="affix">
          <span className="affix-text">₱</span>
          <input className="input input-compact" type="number" min="0" step="1" aria-label={`Price of ${item.name}`}
            value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        {errors.price && <div className="field-error">{errors.price}</div>}
        {!errors.price && Number(price) !== item.price && <div className="catalog-was">was <Money amount={item.price} /></div>}
      </div>
      <div className="catalog-cell" data-label={isService ? 'Length' : undefined}>
        {isService && (
          <>
            <div className="affix affix-end">
              <input className="input input-compact" type="number" min="15" max="480" step="5" aria-label={`Duration of ${item.name} in minutes`}
                value={duration} onChange={(e) => setDuration(e.target.value)} />
              <span className="affix-text">min</span>
            </div>
            {errors.durationMinutes && <div className="field-error">{errors.durationMinutes}</div>}
          </>
        )}
      </div>
      <div className="catalog-cell" data-label="Offered">
        <label className="switch">
          <input type="checkbox" aria-label={`${item.name} is offered`} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="switch-text" aria-hidden="true">{isActive ? 'Yes' : 'No'}</span>
        </label>
      </div>
      <div className="catalog-cell catalog-actions">
        <div className="row-actions">
          <Button size="sm" disabled={!dirty} loading={saving} onClick={save}>Save</Button>
          <Button variant="danger-ghost" size="sm" disabled={saving} onClick={remove}>Remove</Button>
        </div>
        {errors.form && <div className="field-error">{errors.form}</div>}
      </div>
    </div>
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
  const isService = kind === 'service'

  const submit = async (e) => {
    e.preventDefault()
    const found = Object.fromEntries([['name', validateServiceName(name)], ['price', validatePrice(price)],
      ['durationMinutes', isService ? validateDuration(duration) : null]].filter(([, m]) => m))
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      if (isService) await api.admin.createService({ category, name, price: Number(price), durationMinutes: Number(duration) })
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

  // Same columns as the list above, so the new item's fields sit under the matching column.
  return (
    <form className="catalog-add" onSubmit={submit} noValidate>
      <h3>Add {isService ? 'a service' : 'an add-on'}</h3>
      {errors.form && <Alert kind="error">{errors.form}</Alert>}
      <div className="catalog-add-fields">
        <div className={isService ? 'catalog-add-name with-category' : 'catalog-add-name'}>
          {isService && <SelectField label="Category" value={category} options={CATEGORIES} onChange={(e) => setCategory(e.target.value)} />}
          <TextField label="Name" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        </div>
        <TextField label={isService ? 'Price (₱)' : 'Price per nail (₱)'} type="number" min="0" value={price} error={errors.price}
          onChange={(e) => setPrice(e.target.value)} />
        {isService
          ? <TextField label="Length (min)" type="number" min="15" max="480" step="5" value={duration} error={errors.durationMinutes}
              onChange={(e) => setDuration(e.target.value)} />
          : <span className="catalog-spacer" />}
        <Button type="submit" loading={saving}>Add</Button>
      </div>
    </form>
  )
}
