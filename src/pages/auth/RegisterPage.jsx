import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api'
import { NameField, PasswordField, PasswordRules, PhoneField, UsernameField } from '../../components/FormFields'
import { LegalDocumentModal } from '../../components/Modal'
import { Alert, Button, Card, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../api/errors'
import { hasErrors, validateRegistration } from '../../validation/rules'

const empty = { firstName: '', lastName: '', username: '', email: '', phoneNumber: '', password: '', confirmPassword: '', acceptTerms: false }

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [openDocument, setOpenDocument] = useState(null)

  const set = (field) => (value) => {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = validateRegistration(values)
    if (usernameAvailable === false) found.username = 'Username is already taken.'
    setErrors(found)
    setFailure(null)
    if (hasErrors(found)) return

    setSubmitting(true)
    try {
      await api.auth.register(values)
      navigate(`/verify-email?email=${encodeURIComponent(values.email.trim().toLowerCase())}`, { state: { registered: true } })
    } catch (err) {
      setErrors(fieldErrors(err))
      setFailure(Object.keys(fieldErrors(err)).length ? null : errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card auth-card-wide">
        <h1>Create your account</h1>
        <p className="muted">Book appointments and keep track of your visits.</p>
        {failure && <Alert kind="error">{failure}</Alert>}

        <form onSubmit={submit} noValidate className="stack">
          <div className="grid-2">
            <NameField label="First Name" autoComplete="given-name" value={values.firstName} onChange={set('firstName')} error={errors.firstName} />
            <NameField label="Last Name" autoComplete="family-name" value={values.lastName} onChange={set('lastName')} error={errors.lastName} />
          </div>
          <UsernameField value={values.username} onChange={set('username')} error={errors.username} onAvailabilityChange={setUsernameAvailable} />
          <div className="grid-2">
            <TextField label="Email address" type="email" autoComplete="email" value={values.email} required
              error={errors.email} onChange={(e) => set('email')(e.target.value)} />
            <PhoneField value={values.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber} />
          </div>
          <PasswordField value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password">
            <PasswordRules password={values.password} />
          </PasswordField>
          <PasswordField label="Confirm Password" value={values.confirmPassword} onChange={set('confirmPassword')}
            error={errors.confirmPassword} autoComplete="new-password" />

          <div className={errors.acceptTerms ? 'checkbox-field field-invalid' : 'checkbox-field'}>
            <label>
              <input type="checkbox" checked={values.acceptTerms} onChange={(e) => set('acceptTerms')(e.target.checked)} />
              <span>
                I have read and accept the{' '}
                <button type="button" className="link-button" onClick={() => setOpenDocument('terms')}>Terms &amp; Conditions</button>
                {' '}and the{' '}
                <button type="button" className="link-button" onClick={() => setOpenDocument('privacy')}>Privacy Policy</button>.
              </span>
            </label>
            {errors.acceptTerms && <div className="field-error">{errors.acceptTerms}</div>}
          </div>

          {/* Disabled until the Terms & Conditions are accepted (Ref 1.6). */}
          <Button type="submit" loading={submitting} disabled={!values.acceptTerms} className="btn-block">Create account</Button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </Card>

      {openDocument && <LegalDocumentModal document={openDocument} onClose={() => setOpenDocument(null)} />}
    </div>
  )
}
