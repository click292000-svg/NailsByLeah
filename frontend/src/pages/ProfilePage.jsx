import { useState } from 'react'
import { api } from '../api'
import { errorMessage, fieldErrors } from '../api/errors'
import { useAuth } from '../auth/AuthContext'
import { NameField, PhoneField } from '../components/FormFields'
import { Alert, Button, Card, PageHeader } from '../components/ui'
import { normalizePhone, validateName, validatePhone } from '../validation/rules'

/**
 * The signed-in user's own profile: name and phone number can be changed; username and email can't (they sign the
 * user in). The server only ever changes the profile of whoever is signed in, and checks everything again.
 */
export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [values, setValues] = useState({ firstName: user.firstName, lastName: user.lastName, phoneNumber: user.phoneNumber })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState(null)

  const set = (field) => (value) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setSaved(false)
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
      setSaved(true)
    } catch (err) {
      const fields = Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
      setErrors(fields)
      if (!Object.keys(fields).length) setFailure(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="narrow stack-lg profile-page">
      <PageHeader title="My profile" subtitle="Keep your name and phone number up to date so Leyah can reach you." />
      {saved && <Alert kind="success" onClose={() => setSaved(false)}>Your profile was saved.</Alert>}
      {failure && <Alert kind="error" onClose={() => setFailure(null)}>{failure}</Alert>}

      <Card title="Account">
        <dl className="profile-facts">
          <div><dt>Username</dt><dd>@{user.username}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
        </dl>
        <p className="muted small">Your username and email address sign you in, so they can&apos;t be changed here.</p>
      </Card>

      <Card title="Your details">
        <form onSubmit={submit} noValidate className="stack">
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
    </div>
  )
}
