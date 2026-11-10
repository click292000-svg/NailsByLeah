import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { api } from '../../api'
import { PasswordField, PasswordRules } from '../../components/FormFields'
import { Alert, Button, Card, PageLoader, TextField } from '../../components/ui'
import { ApiError, errorMessage, fieldErrors } from '../../api/errors'
import { useAsync } from '../../hooks/useAsync'
import { hasErrors, validateEmail, validateResetPassword, validateVerificationCode } from '../../validation/rules'

// Another code can be asked for a minute after the last one. The server enforces it; the page remembers when the
// wait ends (also across a refresh) only to show the countdown.
export const RESEND_WAIT_SECONDS = 60
const waitKey = (email) => `nbl.resendAt.${email.trim().toLowerCase()}`
const readWaitEnd = (email) => {
  try {
    return Number(localStorage.getItem(waitKey(email))) || 0
  } catch {
    return 0
  }
}
const saveWaitEnd = (email, seconds) => {
  try {
    localStorage.setItem(waitKey(email), String(Date.now() + seconds * 1000))
  } catch {
    // Without storage the countdown just starts over after a refresh; the server still enforces the wait.
  }
}

/** Seconds left before another code can be asked for, counting down once a second. */
function useResendCountdown(email) {
  const [now, setNow] = useState(() => Date.now())
  const [, setBump] = useState(0)
  const left = email ? Math.max(0, Math.ceil((readWaitEnd(email) - now) / 1000)) : 0
  useEffect(() => {
    if (left <= 0) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [left])
  const start = (seconds = RESEND_WAIT_SECONDS) => {
    saveWaitEnd(email, seconds)
    setNow(Date.now())
    setBump((n) => n + 1)
  }
  return [left, start]
}

/** Enter the 6-digit code sent after registration (Ref 9.1). */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(location.state?.registered ? 'registered' : null)
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [waitLeft, startWait] = useResendCountdown(email)

  // Sign-up has just sent the first code, so the wait starts now.
  useEffect(() => {
    if (location.state?.registered && email && !readWaitEnd(email)) startWait()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Registration is complete: on to the landing page, which welcomes the new client.
      navigate('/', { replace: true, state: { welcome: 'verified' } })
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
    if (waitLeft > 0) return
    setResending(true)
    setFailure(null)
    try {
      await api.auth.resendVerification(email)
      setStatus('resent')
      startWait()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'resend_cooldown') startWait(err.retryAfterSeconds ?? RESEND_WAIT_SECONDS)
      else setFailure(errorMessage(err))
    } finally {
      setResending(false)
    }
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
          <Button variant="ghost" onClick={resend} loading={resending} disabled={waitLeft > 0} aria-describedby="resend-wait">
            {waitLeft > 0 ? `Resend code in ${waitLeft} second${waitLeft === 1 ? '' : 's'}` : 'Send a new code'}
          </Button>
          {waitLeft > 0 && <p id="resend-wait" className="muted small resend-wait">You can ask for another code once the countdown ends.</p>}
        </form>
      </Card>
    </div>
  )
}

/** Request a reset link by email (Ref 1.4, 1.10). */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  // Problems that aren't about the email itself (e.g. "Too many attempts") go above the form, not under the field.
  const [formError, setFormError] = useState(null)
  const [sent, setSent] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const emailError = validateEmail(email)
    setError(emailError)
    setFormError(null)
    if (emailError) return
    setSubmitting(true)
    try {
      setSent((await api.auth.forgotPassword(email)).message)
    } catch (err) {
      const fieldError = fieldErrors(err).email
      if (fieldError) setError(fieldError)
      else setFormError(errorMessage(err))
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
            {formError && <Alert kind="error">{formError}</Alert>}
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
  const { hash } = useLocation()
  // Emailed links carry the token after "#", which browsers never send to a server, so it can't end up in hosting
  // logs. "?token=" still works for links sent before this change.
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? params.get('token') ?? ''
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
