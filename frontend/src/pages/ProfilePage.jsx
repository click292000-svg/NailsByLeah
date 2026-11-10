import { useRef, useState } from 'react'
import { api } from '../api'
import { errorMessage, fieldErrors } from '../api/errors'
import { useAuth } from '../auth/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { NameField, PasswordField, PasswordRules, PhoneField } from '../components/FormFields'
import { formatPhone, useSalon } from '../components/SalonProfile'
import { Alert, Button, Card, Field, Money, PageHeader, TextField } from '../components/ui'
import { shrinkImage } from '../lib/shrinkImage'
import { formatDate, formatDateTime, formatTime } from '../lib/format'
import { Link, useNavigate } from 'react-router'
import { colorFor, colorLabel } from '../lib/shades'
import { apiPhotoSrc } from '../lib/photos'
import { normalizePhone, validateName, validatePhone, validateResetPassword } from '../validation/rules'

const firstError = (err) => Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))

/**
 * The signed-in user's own profile. Everyone can change their name and phone number and their password, and sign out
 * their other devices. Leyah also has her photo, the salon details clients see on the website, and her email alerts.
 * The server only ever changes the profile of whoever is signed in, and checks everything again.
 */
export default function ProfilePage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'Administrator'
  const [notice, setNotice] = useState(null)
  const done = (text) => setNotice(text)

  return (
    <div className="stack-lg profile-page profile-wide">
      <PageHeader title="My profile"
        subtitle={isAdmin ? 'Your photo, contact details and the salon information clients see on the website.' : 'Keep your name and phone number up to date so Leyah can reach you.'} />
      {notice && <Alert kind="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <div className="profile-grid">
        <div className="stack-lg">
          {isAdmin ? <PhotoCard onDone={done} /> : <ClientPhotoCard onDone={done} />}
          <SecurityCard onDone={done} canSignOutOthers={isAdmin} />
        </div>
        <div className="stack-lg">
          <AccountCard />
          <DetailsCard onDone={done} />
          {isAdmin ? <SalonCard onDone={done} /> : <LastVisitCard />}
        </div>
      </div>
    </div>
  )
}

/** The client's own photo: in their top bar, and with their bookings so Leyah recognises who is coming. */
function ClientPhotoCard({ onDone }) {
  const { user, updateUser } = useAuth()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const photo = apiPhotoSrc(user.photoUrl, user.photoDataUrl)
  const since = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : null

  const run = async (action, message) => {
    setBusy(true)
    setError(null)
    try {
      updateUser(await action())
      onDone(message)
    } catch (err) {
      setError(firstError(err).file ?? errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await run(async () => api.auth.uploadPhoto(await shrinkImage(file)), 'Your photo was updated.')
  }

  return (
    <Card className="profile-photo-card">
      <div className="profile-photo">
        {photo ? <img src={photo} alt={`${user.firstName}'s photo`} /> : <span aria-hidden="true">{user.firstName.slice(0, 1)}</span>}
      </div>
      <p className="profile-name">{user.firstName} {user.lastName}</p>
      <p className="muted small">@{user.username}{since && ` · Client since ${since}`}</p>
      {error && <Alert kind="error">{error}</Alert>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} aria-label="Choose a photo" tabIndex={-1} />
      <div className="profile-photo-actions">
        <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>{photo ? 'Change photo' : 'Upload photo'}</Button>
        {photo && <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => api.auth.removePhoto(), 'Your photo was removed.')}>Remove</Button>}
      </div>
      <p className="muted small">JPG, PNG or WebP. Only you and Leyah can see it; it helps her recognise you.</p>
    </Card>
  )
}

/**
 * The client's last finished visit, with Book again: the booking page opens with the same services, removal, colour and
 * Stones already chosen, so only a date and time are left to pick.
 */
function LastVisitCard() {
  const navigate = useNavigate()
  const history = useAsync(() => api.bookings.history(), [])
  const last = (history.data ?? [])
    .filter((b) => b.status === 'Completed')
    .sort((x, y) => `${y.bookingDate}${y.startTime}`.localeCompare(`${x.bookingDate}${x.startTime}`))[0]

  return (
    <Card title="Your last visit">
      {history.loading && <p className="muted">Loading…</p>}
      {history.error && <Alert kind="error">{errorMessage(history.error)}</Alert>}
      {history.data && !last && (
        <div className="profile-empty">
          <p className="muted">No finished visits yet. Once you&apos;ve had an appointment, you can book the same set again from here.</p>
          <Link to="/book" className="btn btn-primary btn-sm">Book an appointment</Link>
        </div>
      )}
      {last && (
        <>
          <dl className="profile-visit">
            <div><dt>Date</dt><dd>{formatDate(last.bookingDate)}, {formatTime(last.startTime)}</dd></div>
            <div><dt>Services</dt><dd>{last.removalServiceName ? `Removal (${last.removalServiceName}), then ${last.serviceName}`
              : last.serviceCategory === 'Removal' ? `Removal (${last.serviceName})` : last.serviceName}</dd></div>
            {last.nailColor && (
              <div><dt>Colour</dt><dd>
                {colorFor(last.nailColor) && <span className="bd-swatch" style={{ background: colorFor(last.nailColor) }} aria-hidden="true" />}
                {colorLabel(last.nailColor)}
              </dd></div>
            )}
            {last.addOns.length > 0 && (
              <div><dt>Stones</dt><dd>{last.addOns.map((a) => `${a.name} (${a.handLabel.toLowerCase()}, ${a.nailCount} ${a.nailCount === 1 ? 'nail' : 'nails'})`).join(', ')}</dd></div>
            )}
            <div><dt>Total</dt><dd><Money amount={last.totalPrice} /></dd></div>
          </dl>
          <div className="row profile-visit-actions">
            <Button onClick={() => navigate('/book', { state: { repeat: last } })}>Book again</Button>
            <span className="muted small">Same set, chosen for you. Just pick a date and time; prices are today&apos;s.</span>
          </div>
        </>
      )}
    </Card>
  )
}

function AccountCard() {
  const { user } = useAuth()
  return (
    <Card title="Account">
      <dl className="profile-facts">
        <div><dt>Username</dt><dd>@{user.username}</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
      </dl>
      <p className="muted small">Your username and email address sign you in, so they can&apos;t be changed here.</p>
    </Card>
  )
}

/** Leyah's photo: in the top bar and on the home page next to her bio. */
function PhotoCard({ onDone }) {
  const { user } = useAuth()
  const salon = useSalon()
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const saved = await api.admin.uploadSalonPhoto(await shrinkImage(file))
      salon.replace(saved.profile)
      onDone('Your photo was updated. It now shows in the top bar and on the home page.')
    } catch (err) {
      setError(firstError(err).file ?? errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      salon.replace((await api.admin.removeSalonPhoto()).profile)
      onDone('Your photo was removed.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="profile-photo-card">
      <div className="profile-photo">
        {salon.photo ? <img src={salon.photo} alt={`${user.firstName}'s photo`} /> : <span aria-hidden="true">{user.firstName.slice(0, 1)}</span>}
      </div>
      <p className="profile-name">{user.firstName} {user.lastName}</p>
      <p className="muted small">@{user.username} · Owner</p>
      {error && <Alert kind="error">{error}</Alert>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} aria-label="Choose a photo" tabIndex={-1} />
      <div className="profile-photo-actions">
        <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>{salon.photo ? 'Change photo' : 'Upload photo'}</Button>
        {salon.photo && <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>Remove</Button>}
      </div>
      <p className="muted small">JPG, PNG or WebP. Shown in the top bar and on the home page next to your bio.</p>
    </Card>
  )
}

function DetailsCard({ onDone }) {
  const { user, updateUser } = useAuth()
  const [values, setValues] = useState({ firstName: user.firstName, lastName: user.lastName, phoneNumber: user.phoneNumber })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState(null)

  const set = (field) => (value) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  const dirty = values.firstName.trim() !== user.firstName || values.lastName.trim() !== user.lastName
    || normalizePhone(values.phoneNumber) !== user.phoneNumber

  const submit = async (e) => {
    e.preventDefault()
    const found = Object.fromEntries([
      ['firstName', validateName(values.firstName, 'First Name')],
      ['lastName', validateName(values.lastName, 'Last Name')],
      ['phoneNumber', validatePhone(values.phoneNumber)],
    ].filter(([, message]) => message))
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const profile = await api.auth.updateProfile(values)
      updateUser(profile)
      setValues({ firstName: profile.firstName, lastName: profile.lastName, phoneNumber: profile.phoneNumber })
      onDone('Your profile was saved.')
    } catch (err) {
      const fields = firstError(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFailure(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Your details">
      <form onSubmit={submit} noValidate className="stack">
        {failure && <Alert kind="error">{failure}</Alert>}
        <div className="profile-names">
          <NameField label="First Name" autoComplete="given-name" value={values.firstName} onChange={set('firstName')} error={errors.firstName} />
          <NameField label="Last Name" autoComplete="family-name" value={values.lastName} onChange={set('lastName')} error={errors.lastName} />
        </div>
        <PhoneField value={values.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber}
          onBlur={() => values.phoneNumber && setErrors((e) => ({ ...e, phoneNumber: validatePhone(values.phoneNumber) ?? undefined }))} />
        <p className="muted small">We only check that this looks like a Philippine mobile number; it isn&apos;t verified by text message.</p>
        <div className="row">
          <Button type="submit" loading={saving} disabled={!dirty}>Save changes</Button>
        </div>
      </form>
    </Card>
  )
}

/** The salon details shown to clients, and which emails Leyah gets. One Save for both. */
function SalonCard({ onDone }) {
  const salon = useSalon()
  const settings = useAsync(() => api.admin.salonSettings(), [])
  if (settings.loading && !settings.data) return <Card title="Salon details"><p className="muted">Loading…</p></Card>
  if (settings.error) return <Card title="Salon details"><Alert kind="error">{errorMessage(settings.error)}</Alert></Card>
  return <SalonForm initial={settings.data} onSaved={(saved) => { salon.replace(saved.profile); onDone('Salon details saved. Clients see them on the website now.') }} />
}

const SALON_FIELDS = ['phone', 'paymentAccountName', 'facebookUrl', 'instagramUrl', 'instagramHandle', 'bio']

function SalonForm({ initial, onSaved }) {
  const [values, setValues] = useState(() => ({
    ...Object.fromEntries(SALON_FIELDS.map((f) => [f, initial.profile[f] ?? ''])),
    alertNewBooking: initial.alertNewBooking, alertCancellation: initial.alertCancellation, alertReschedule: initial.alertReschedule,
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState(null)
  const set = (field) => (value) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const phoneProblem = values.phone.trim() ? validatePhone(values.phone) : null
    if (phoneProblem) {
      setErrors({ phone: phoneProblem })
      return
    }
    setSaving(true)
    setFailure(null)
    try {
      const body = { ...values, ...Object.fromEntries(SALON_FIELDS.map((f) => [f, values[f].trim() || null])) }
      const saved = await api.admin.updateSalonSettings(body)
      setValues((v) => ({ ...v, ...Object.fromEntries(SALON_FIELDS.map((f) => [f, saved.profile[f] ?? ''])) }))
      onSaved(saved)
    } catch (err) {
      const fields = firstError(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFailure(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="stack-lg">
      <Card title={<>Salon details <span className="profile-tag">Shown to clients</span></>}>
        {failure && <Alert kind="error">{failure}</Alert>}
        <div className="profile-names">
          <PhoneField label="Salon phone" required={false} value={values.phone} onChange={set('phone')} error={errors.phone} />
          <TextField label="GCash / Maya account name" value={values.paymentAccountName} maxLength={60} error={errors.paymentAccountName}
            hint="Shown on the payment step so clients know who they're paying" onChange={(e) => set('paymentAccountName')(e.target.value)} />
        </div>
        <div className="profile-names">
          <TextField label="Facebook page link" value={values.facebookUrl} maxLength={200} placeholder="https://facebook.com/…" error={errors.facebookUrl}
            onChange={(e) => set('facebookUrl')(e.target.value)} />
          <TextField label="Instagram link" value={values.instagramUrl} maxLength={200} placeholder="https://instagram.com/…" error={errors.instagramUrl}
            onChange={(e) => set('instagramUrl')(e.target.value)} />
        </div>
        <TextField label="Instagram name" value={values.instagramHandle} maxLength={31} placeholder="@yourname" error={errors.instagramHandle}
          onChange={(e) => set('instagramHandle')(e.target.value)} />
        <Field label="Short bio" error={errors.bio} counter={`${values.bio.length}/300`} hint="Shown on the home page next to your photo">
          {(aria) => <textarea className="input" rows={3} maxLength={300} value={values.bio} onChange={(e) => set('bio')(e.target.value)} {...aria} />}
        </Field>
        <p className="muted small">The phone shows in the footer and on the home page; the links are the Facebook and Instagram buttons across the site.</p>
      </Card>

      <Card title="Email alerts">
        <p className="muted small">Emails sent to the salon&apos;s address. Clients always get their own emails.</p>
        {[
          ['alertNewBooking', 'New booking paid', 'A client booked and paid; it waits for you to confirm'],
          ['alertCancellation', 'Client cancels', 'Includes any refund you need to send'],
          ['alertReschedule', 'Client moves a booking', 'With the old and the new time'],
        ].map(([field, label, hint]) => (
          <label key={field} className="profile-switch">
            <span><strong>{label}</strong><span className="muted small">{hint}</span></span>
            <input type="checkbox" role="switch" checked={values[field]} onChange={(e) => set(field)(e.target.checked)} />
          </label>
        ))}
        <div className="row">
          <Button type="submit" loading={saving}>Save salon details</Button>
        </div>
      </Card>
    </form>
  )
}

function SecurityCard({ onDone, canSignOutOthers }) {
  const security = useAsync(() => api.auth.security(), [])
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [failure, setFailure] = useState(null)
  const previous = security.data?.previousSignInAt

  const set = (field) => (value) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const change = async (e) => {
    e.preventDefault()
    const found = {}
    if (!values.currentPassword) found.currentPassword = 'Enter your current password.'
    const rule = validateResetPassword({ newPassword: values.newPassword }).newPassword
    if (rule) found.newPassword = rule
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const { message } = await api.auth.changePassword(values)
      setValues({ currentPassword: '', newPassword: '' })
      onDone(message)
    } catch (err) {
      const fields = firstError(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFailure(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const signOutOthers = async () => {
    setSigningOut(true)
    setFailure(null)
    try {
      onDone((await api.auth.signOutOtherDevices()).message)
    } catch (err) {
      setFailure(errorMessage(err))
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <Card title="Security">
      <p className="muted small">
        {previous ? <>Previous sign-in: {formatDateTime(previous)}. Not you? Change your password.</> : 'This is your first sign-in on record.'}
      </p>
      {failure && <Alert kind="error">{failure}</Alert>}
      <form onSubmit={change} noValidate className="stack">
        <PasswordField label="Current password" value={values.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} />
        <PasswordField label="New password" autoComplete="new-password" value={values.newPassword} onChange={set('newPassword')} error={errors.newPassword} />
        <PasswordRules password={values.newPassword} />
        <div className="row">
          <Button type="submit" variant="secondary" loading={saving}>Change password</Button>
        </div>
      </form>
      {canSignOutOthers && (
        <div className="profile-signout">
          <p className="muted small">Signed in on a shared or lost phone? Sign it out. You stay signed in here.</p>
          <Button variant="ghost" size="sm" loading={signingOut} onClick={signOutOthers}>Sign out other devices</Button>
        </div>
      )}
    </Card>
  )
}
