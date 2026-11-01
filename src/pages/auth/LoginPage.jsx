import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { canOpen, homeFor, useAuth } from '../../auth/AuthContext'
import { PasswordField } from '../../components/FormFields'
import { Alert, Button, Card, PageLoader, TextField } from '../../components/ui'
import { ApiError, errorMessage, fieldErrors } from '../../api/errors'
import { hasErrors, validateLogin } from '../../validation/rules'
import { config } from '../../config'
import { demoAccounts } from '../../mock/data/users'

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
      // Return to the page that asked for a login, unless it belongs to the other role.
      const from = location.state?.from
      navigate(from && canOpen(user.role, from) ? from : homeFor(user.role), { replace: true })
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
      <Card className="auth-card">
        <h1>Log in</h1>
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

        {config.useMockApi && (
          <div className="demo-accounts">
            <strong>Demo accounts (mock mode)</strong>
            {demoAccounts.map((account) => (
              <button key={account.username} type="button" className="btn btn-ghost btn-sm"
                onClick={() => setValues({ usernameOrEmail: account.username, password: account.password })}>
                Use {account.label}
              </button>
            ))}
          </div>
        )}
      </Card>
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
