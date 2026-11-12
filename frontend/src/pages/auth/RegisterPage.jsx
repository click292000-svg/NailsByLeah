import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api'
import { NameField, PasswordField, PasswordRules, PhoneField, UsernameField } from '../../components/FormFields'
import { LegalDocumentModal } from '../../components/Modal'
import { Alert, Button, Card, TextField } from '../../components/ui'
import { errorMessage, fieldErrors } from '../../api/errors'
import { hasErrors, validatePhone, validateRegistration } from '../../validation/rules'

const empty = { firstName: '', lastName: '', username: '', email: '', phoneNumber: '', password: '', confirmPassword: '', acceptTerms: false }

export default function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [openDocument, setOpenDocument] = useState(null)
  // The box can be ticked only once both documents have been read to the end.
  const [read, setRead] = useState({ terms: false, privacy: false })
  const readBoth = read.terms && read.privacy
  const [nudge, setNudge] = useState(null)
  // Decided when the window opens: unread, it must be scrolled to the end; read already, it is for reference only.
  const open = (kind) => setOpenDocument({ kind, mustRead: !read[kind] })

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
      {/* The same photo-and-form card as Log in. */}
      <div className="login-split register-split">
      <aside className="login-art" aria-hidden="true">
        <img src="/img/service-plain.jpg" alt="" width="640" height="640" />
        <div className="login-art-text">
          <p className="login-art-name">Join Nails by Leyah</p>
          <p>Save your details once, then book any time and keep your visits in one place.</p>
        </div>
      </aside>
      <Card className="auth-card auth-card-wide login-card">
        <div className="login-head">
          <h1>Create your account</h1>
          <p className="muted">Book appointments and keep track of your visits.</p>
        </div>
        {failure && <Alert kind="error">{failure}</Alert>}

        <form onSubmit={submit} noValidate className="stack">
          <div className="grid-2">
            <NameField label="First Name" autoComplete="given-name" value={values.firstName} onChange={set('firstName')} error={errors.firstName} />
            <NameField label="Last Name" autoComplete="family-name" value={values.lastName} onChange={set('lastName')} error={errors.lastName} />
          </div>
          <div className="grid-2">
            <UsernameField value={values.username} onChange={set('username')} error={errors.username} onAvailabilityChange={setUsernameAvailable} />
            <PhoneField value={values.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber}
              onBlur={() => values.phoneNumber && setErrors((e) => ({ ...e, phoneNumber: validatePhone(values.phoneNumber) ?? undefined }))} />
          </div>
          <TextField label="Email address" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} required
            error={errors.email} onChange={(e) => set('email')(e.target.value)} />
          <div className="grid-2">
            <PasswordField value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password" />
            <PasswordField label="Confirm Password" value={values.confirmPassword} onChange={set('confirmPassword')}
              error={errors.confirmPassword} autoComplete="new-password" />
          </div>
          {/* The password rules span both columns so they stay readable. */}
          <PasswordRules password={values.password} />

          {/* One light card: a row for each document (tap to read; a tick once read), then the agreement. */}
          <div className={values.acceptTerms ? 'su-terms agreed' : 'su-terms'}>
            <p className="su-terms-title">Before you sign up, please read:</p>
            <ul className="su-docs">
              {[['terms', 'Terms & Conditions'], ['privacy', 'Privacy Policy']].map(([kind, label]) => (
                <li key={kind}>
                  <button type="button" className={read[kind] ? 'su-doc is-read' : 'su-doc'} onClick={() => { setNudge(null); open(kind) }}
                    aria-describedby="signup-agree-hint">
                    <span className="su-doc-icon" aria-hidden="true">
                      {read[kind]
                        ? <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>
                        : <svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>}
                    </span>
                    <span className="su-doc-name">{label}</span>
                    <span className="su-doc-state" aria-hidden="true">{read[kind] ? 'Read' : 'Tap to read'}</span>
                    <svg className="su-doc-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                </li>
              ))}
            </ul>
            {/* A click on the box before both are read can't reach it, so the row says why. */}
            <label className={readBoth ? 'su-agree' : 'su-agree is-locked'}
              onClick={() => !readBoth && setNudge('Please open and read both documents to the end first.')}>
              <input type="checkbox" checked={values.acceptTerms} disabled={!readBoth} aria-describedby="signup-agree-hint"
                onChange={(e) => { set('acceptTerms')(e.target.checked); setNudge(null) }} />
              <span>I have read and accept the Terms &amp; Conditions and the Privacy Policy.</span>
            </label>
            <p id="signup-agree-hint" className={nudge || errors.acceptTerms ? 'su-hint field-error' : 'su-hint'}>
              {nudge ?? errors.acceptTerms ?? (values.acceptTerms ? 'Thank you! You can create your account now.'
                : readBoth ? 'Now tick the box to agree.'
                  : `Open ${read.terms ? 'the Privacy Policy' : read.privacy ? 'the Terms & Conditions' : 'each one'} and scroll to the end to unlock the box.`)}
            </p>
          </div>

          {/* Disabled until the Terms & Conditions are accepted (Ref 1.6). */}
          <Button type="submit" loading={submitting} disabled={!values.acceptTerms} className="btn-block">Create account</Button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </Card>
      </div>

      {openDocument && (
        <LegalDocumentModal document={openDocument.kind} onClose={() => setOpenDocument(null)}
          onReadToEnd={openDocument.mustRead ? () => setRead((r) => ({ ...r, [openDocument.kind]: true })) : undefined} />
      )}
    </div>
  )
}
