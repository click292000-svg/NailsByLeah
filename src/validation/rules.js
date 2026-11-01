// Single source of truth for form validation (Ref 14.2). Every form and the mock backend use
// these rules. Limits and messages match the C# backend (backend/Validation/ValidationRules.cs).

export const LIMITS = {
  nameMax: 75,
  usernameMin: 3,
  usernameMax: 50,
  emailMax: 254,
  phoneMinDigits: 7,
  phoneMaxDigits: 15,
  passwordMin: 8,
  passwordMaxBytes: 72,
  explanationMax: 500,
  serviceNameMax: 100,
  maxPrice: 100000,
  blockReasonMax: 200,
  maxNailsPerAddOn: 10,
}

export const PASSWORD_DESCRIPTION =
  'Password must be at least 8 characters and include at least one letter and one number.'

/** Removes everything except digits, e.g. "0917-123 4567" → "09171234567" (Ref 1.3). */
export const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '')

export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= LIMITS.passwordMin },
  { id: 'letter', label: 'At least one letter', test: (p) => /\p{L}/u.test(p) },
  { id: 'number', label: 'At least one number', test: (p) => /\d/.test(p) },
]

export function passwordMeetsRules(password) {
  const value = password ?? ''
  return PASSWORD_RULES.every((rule) => rule.test(value)) && new TextEncoder().encode(value).length <= LIMITS.passwordMaxBytes
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateName(value, label) {
  const text = String(value ?? '').trim()
  if (!text) return `${label} is required.`
  if (text.length > LIMITS.nameMax) return `${label} must be ${LIMITS.nameMax} characters or fewer.`
  return null
}

export function validateUsername(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Username is required.'
  if (text.length < LIMITS.usernameMin || text.length > LIMITS.usernameMax)
    return `Username must be ${LIMITS.usernameMin} to ${LIMITS.usernameMax} characters.`
  return null
}

export function validateEmail(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Email address is required.'
  if (!EMAIL_PATTERN.test(text)) return 'Enter a valid email address.'
  if (text.length > LIMITS.emailMax) return 'Email address is too long.'
  return null
}

export function validatePhone(value) {
  const digits = digitsOnly(value)
  if (digits.length < LIMITS.phoneMinDigits || digits.length > LIMITS.phoneMaxDigits)
    return `Phone Number must contain ${LIMITS.phoneMinDigits} to ${LIMITS.phoneMaxDigits} digits.`
  return null
}

export function validatePassword(value) {
  return passwordMeetsRules(value) ? null : PASSWORD_DESCRIPTION
}

export function validateConfirmPassword(password, confirm) {
  return password === confirm ? null : 'Passwords do not match.'
}

export function validateVerificationCode(value) {
  return /^\s*\d{6}\s*$/.test(String(value ?? '')) ? null : 'Enter the 6-digit code from your email.'
}

export function validatePrice(value) {
  const number = Number(value)
  if (value === '' || value === null || !Number.isFinite(number) || number < 0 || number > LIMITS.maxPrice)
    return `Price must be between 0 and ${LIMITS.maxPrice.toLocaleString()}.`
  return null
}

export function validateServiceName(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Name is required.'
  if (text.length > LIMITS.serviceNameMax) return `Name must be ${LIMITS.serviceNameMax} characters or fewer.`
  return null
}

/** Returns only the fields that have errors, e.g. { firstName: '...' }. */
function collect(entries) {
  return Object.fromEntries(entries.filter(([, message]) => message))
}

export function validateRegistration(values) {
  return collect([
    ['firstName', validateName(values.firstName, 'First Name')],
    ['lastName', validateName(values.lastName, 'Last Name')],
    ['username', validateUsername(values.username)],
    ['email', validateEmail(values.email)],
    ['phoneNumber', validatePhone(values.phoneNumber)],
    ['password', validatePassword(values.password)],
    ['confirmPassword', validateConfirmPassword(values.password, values.confirmPassword)],
    ['acceptTerms', values.acceptTerms ? null : 'You must accept the Terms & Conditions to register.'],
  ])
}

export function validateLogin(values) {
  return collect([
    ['usernameOrEmail', String(values.usernameOrEmail ?? '').trim() ? null : 'Username or email is required.'],
    ['password', values.password ? null : 'Password is required.'],
  ])
}

export function validateResetPassword(values) {
  return collect([
    ['newPassword', validatePassword(values.newPassword)],
    ['confirmPassword', validateConfirmPassword(values.newPassword, values.confirmPassword)],
  ])
}

export const hasErrors = (errors) => Object.keys(errors).length > 0
