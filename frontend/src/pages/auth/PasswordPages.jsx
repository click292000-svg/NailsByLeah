import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { api } from '../../api'
import { PasswordField, PasswordRules } from '../../components/FormFields'
import { Alert, Button, Card, PageLoader, TextField } from '../../components/ui'
import { ApiError, errorMessage, fieldErrors } from '../../api/errors'
import { useAsync } from '../../hooks/useAsync'
import { hasErrors, validateEmail, validateResetPassword, validateVerificationCode } from '../../validation/rules'

/** Enter the 6-digit code sent after registration (Ref 9.1). */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(location.state?.registered ? 'registered' : null)
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const found = { email: validateEmail(email), code: validateVerificationCode(code) }
    Object.keys(found).forEach((k) => !found[k] && delete found[k])
    setErrors(found)
    setFailure(null)
    if (hasErrors(found)) return
    setSubmitting(true)
    try {
      await api.auth.verifyEmail({ email, code })
      setStatus('verified')
    } catch (err) {
      setErrors(fieldErrors(err))
      if (!Object.keys(fieldErrors(err)).length) setFailure(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const resend = async () => {
    const emailError = validateEmail(email)
    if (emailError) {
      setErrors({ email: emailError })
      return
    }
    setResending(true)
    try {
      await api.auth.resendVerification(email)
      setStatus('resent')
    } catch (err) {
      setFailure(errorMessage(err))
    } finally {
      setResending(false)
    }
  }

  if (status === 'verified') {
    return (
      <div className="auth-page">
        <Card className="auth-card">
          <h1>Email verified</h1>
          <Alert kind="success">Your email address is verified. You can now log in.</Alert>
          <Link to="/login" className="btn btn-primary btn-block">Log in</Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Verify your email</h1>
        {status === 'registered' && <Alert kind="success">Account created. One more step to activate it.</Alert>}
        {status === 'resent' && <Alert kind="info">If that account still needs verification, a new code has been sent.</Alert>}
        <p>
          We sent a 6-digit code to your email address. Enter it below to activate your account.
        </p>
        {failure && <Alert kind="error">{failure}</Alert>}
        <form onSubmit={submit} noValidate className="stack">
          <TextField label="Email address" type="email" value={email} required error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} required
            error={errors.code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button type="submit" loading={submitting} className="btn-block">Verify email</Button>
          <Button variant="ghost" onClick={resend} loading={resending}>Send a new code</Button>
        </form>
      </Card>
    </div>
  )
}

/** Request a reset link by email (Ref 1.4, 1.10). */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const emailError = validateEmail(email)
    setError(emailError)
    if (emailError) return
    setSubmitting(true)
    try {
      setSent((await api.auth.forgotPassword(email)).message)
    } catch (err) {
      setError(fieldErrors(err).email ?? errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Forgot your password?</h1>
        {sent ? (
          <>
            <Alert kind="success">{sent}</Alert>
            <Link to="/login">Back to log in</Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="stack">
            <p>Enter the email address you registered with. We&apos;ll send you a link to choose a new password. The link expires in 15 minutes.</p>
            <TextField label="Email address" type="email" autoComplete="email" value={email} required error={error}
              onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" loading={submitting} className="btn-block">Send reset link</Button>
            <Link to="/login">Back to log in</Link>
          </form>
        )}
      </Card>
    </div>
  )
}

/** Choose a new password from a reset link. Expired or used links are reported straight away (Ref 1.11). */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const check = useAsync(() => (token ? api.auth.validateResetToken(token) : Promise.reject(missingToken())), [token])
  const [values, setValues] = useState({ newPassword: '' })
  const [errors, setErrors] = useState({})
  const [linkError, setLinkError] = useState(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const found = validateResetPassword(values)
    setErrors(found)
    if (hasErrors(found)) return
    setSubmitting(true)
    try {
      await api.auth.resetPassword({ token, ...values })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.errors.token) setLinkError(err)
      else setErrors(fieldErrors(err))
    } finally {
      setSubmitting(false)
    }
  }

  const badLink = linkError ?? check.error
  let body
  if (check.loading) body = <PageLoader label="Checking your link…" />
  else if (badLink) body = <BadLink error={badLink} />
  else if (done) {
    body = (
      <>
        <Alert kind="success">Your password has been changed. You can now log in with your new password.</Alert>
        <Link to="/login" className="btn btn-primary btn-block">Log in</Link>
      </>
    )
  } else {
    body = (
      <form onSubmit={submit} noValidate className="stack">
        {/* Entered once: the eye icon shows what was typed instead of a second "confirm" field. */}
        <PasswordField label="New password" value={values.newPassword} autoComplete="new-password" error={errors.newPassword}
          onChange={(v) => setValues({ newPassword: v })}>
          <PasswordRules password={values.newPassword} />
        </PasswordField>
        <Button type="submit" loading={submitting} className="btn-block">Change password</Button>
      </form>
    )
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Choose a new password</h1>
        {body}
      </Card>
    </div>
  )
}

function BadLink({ error }) {
  const expired = error instanceof ApiError && error.code === 'token_expired'
  return (
    <>
      <Alert kind="error" title={expired ? 'This link has expired' : 'This link cannot be used'}>
        {expired
          ? 'Password reset links expire after 15 minutes. Please request a new one.'
          : 'This password reset link is invalid or has already been used. Please request a new one.'}
      </Alert>
      <Link to="/forgot-password" className="btn btn-primary btn-block">Request a new link</Link>
    </>
  )
}

const missingToken = () => new ApiError({ status: 400, message: 'The reset link is missing its token.', code: 'token_invalid' })
