import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { canOpen, homeFor, useAuth } from '../../auth/AuthContext'
import { PasswordField } from '../../components/FormFields'
import { Alert, Button, Card, PageLoader, TextField } from '../../components/ui'
import { ApiError, errorMessage, fieldErrors } from '../../api/errors'
import { hasErrors, validateLogin } from '../../validation/rules'

export default function LoginPage() {
  const { user, ready, login, notice, clearNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState({ usernameOrEmail: '', password: '' })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // Message from an automatic logout (Ref 8.4), shown once.
  const [sessionNotice] = useState(notice)
  useEffect(() => clearNotice(), [clearNotice])

  const set = (field) => (value) => setValues((v) => ({ ...v, [field]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const found = validateLogin(values)
    setErrors(found)
    setFailure(null)
    if (hasErrors(found)) return

    setSubmitting(true)
    try {
      const user = await login(values)
      // Return to the page that asked for a login, unless it belongs to the other role. Otherwise a client starts on
      // the landing page; Leyah starts on her dashboard.
      const from = location.state?.from
      const start = user.role === 'Client' ? '/' : homeFor(user.role)
      navigate(from && canOpen(user.role, from) ? from : start, { replace: true })
    } catch (err) {
      setErrors(fieldErrors(err))
      setFailure(err)
      setSubmitting(false)
    }
  }

  // Already signed in (and not in the middle of this form's own login): go home.
  if (!ready) return <PageLoader />
  if (user && !submitting) return <Navigate to={homeFor(user.role)} replace />

  return (
    <div className="auth-page">
      <div className="login-split">
      {/* A photo of Leyah's work beside the form; a short strip on phones. */}
      <aside className="login-art" aria-hidden="true">
        <img src="/img/service-with-design.jpg" alt="" width="640" height="640" />
        <div className="login-art-text">
          <p className="login-art-name">Nails by Leyah</p>
          <p>Soft gel sets, BIAB and nail art, booked in a few taps.</p>
        </div>
      </aside>
      <Card className="auth-card login-card">
        <div className="login-head">
          <h1>Log in</h1>
          <p className="muted">Welcome back! Log in to book and manage your appointments.</p>
        </div>
        {sessionNotice && <Alert kind="info">{sessionNotice}</Alert>}
        <LoginFailure error={failure} email={values.usernameOrEmail} />

        <form onSubmit={submit} noValidate className="stack">
          <TextField label="Username or email" autoComplete="username" value={values.usernameOrEmail} required
            error={errors.usernameOrEmail} onChange={(e) => set('usernameOrEmail')(e.target.value)} />
          <PasswordField value={values.password} onChange={set('password')} error={errors.password} />
          <div className="form-row-end">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <Button type="submit" loading={submitting} className="btn-block">Log in</Button>
        </form>

        <p className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </Card>
      </div>
    </div>
  )
}

/** Clear messages for lockout (Ref 8.3), unverified email (Ref 9.1) and other failures. */
function LoginFailure({ error, email }) {
  if (!error) return null
  if (error instanceof ApiError && error.code === 'account_locked')
    return <Alert kind="error" title="Account locked">{error.message}</Alert>
  if (error instanceof ApiError && error.code === 'email_not_verified') {
    const query = email.includes('@') ? `?email=${encodeURIComponent(email)}` : ''
    return (
      <Alert kind="warning" title="Email not verified">
        {error.message} <Link to={`/verify-email${query}`}>Enter your verification code</Link>
      </Alert>
    )
  }
  if (error instanceof ApiError && error.status === 400) return null
  return <Alert kind="error">{errorMessage(error)}</Alert>
}
