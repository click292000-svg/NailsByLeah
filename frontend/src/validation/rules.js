// Single source of truth for form validation (Ref 14.2). Every form and the mock backend use
// these rules. Limits and messages match the C# backend (backend/Validation/ValidationRules.cs).

export const LIMITS = {
  nameMax: 75,
  usernameMin: 3,
  usernameMax: 50,
  emailMax: 254,
  phoneDigits: 11,
  passwordMin: 8,
  passwordMaxBytes: 72,
  explanationMax: 500,
  serviceNameMax: 100,
  maxPrice: 100000,
  blockReasonMax: 200,
  maxNailsPerAddOn: 10,
  maxNailsPerHand: 5,
  feedbackCommentMax: 1000,
  noteMax: 300,
  balanceReferenceMax: 50,
  bookingDraftMax: 4000,
  referenceImageMaxBytes: 5 * 1024 * 1024,
  referenceImagesPerBooking: 3,
  serviceDurationMin: 15,
  serviceDurationMax: 480,
  serviceDurationStep: 5,
}

/** Same messages as the backend ReferenceImageService. */
export const REFERENCE_IMAGE_MESSAGES = {
  type: 'Upload a JPG, PNG or WebP image.',
  size: 'The image must be 5 MB or smaller.',
  empty: 'Choose an image to upload.',
  tooMany: 'You can add up to 3 reference photos per booking.',
}

export const REFERENCE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
const REFERENCE_IMAGE_TYPES = new Set(REFERENCE_IMAGE_ACCEPT.split(','))

/**
 * Checks a chosen design photo before it is uploaded. The server checks again, and it looks at the
 * file's actual bytes, so a renamed file of another type is still refused there.
 */
export function validateReferenceImage(file) {
  if (!file || file.size === 0) return REFERENCE_IMAGE_MESSAGES.empty
  if (!REFERENCE_IMAGE_TYPES.has(file.type)) return REFERENCE_IMAGE_MESSAGES.type
  if (file.size > LIMITS.referenceImageMaxBytes) return REFERENCE_IMAGE_MESSAGES.size
  return null
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

/** Same wording as the backend PhoneRule. */
export const PHONE_MESSAGES = {
  required: 'Phone Number is required.',
  digitsOnly: 'Phone Number can only contain numbers (0–9), with no letters, spaces or symbols.',
  tooShort: 'Phone Number is too short. Enter all 11 digits, e.g. 09171234567.',
  tooLong: 'Phone Number is too long. Enter exactly 11 digits, e.g. 09171234567.',
}

/** Contact number: exactly 11 digits and nothing else (Ref 1.3). */
export function validatePhone(value) {
  const text = String(value ?? '').trim()
  if (!text) return PHONE_MESSAGES.required
  if (!/^\d+$/.test(text)) return PHONE_MESSAGES.digitsOnly
  if (text.length < LIMITS.phoneDigits) return PHONE_MESSAGES.tooShort
  if (text.length > LIMITS.phoneDigits) return PHONE_MESSAGES.tooLong
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

/** Same rule as the backend DurationRule: 15 minutes to 8 hours, in 5-minute steps. */
export function validateDuration(value) {
  const number = Number(value)
  if (value === '' || value === null || !Number.isInteger(number) || number < LIMITS.serviceDurationMin
    || number > LIMITS.serviceDurationMax || number % LIMITS.serviceDurationStep !== 0)
    return 'Duration must be between 15 minutes and 8 hours, in steps of 5 minutes.'
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
  ])
}

export const HAND_REQUIRED_MESSAGE = 'Choose the left hand, the right hand or both hands for each add-on.'
export const HAND_TOO_MANY_MESSAGE = 'One hand has 5 nails. Choose both hands for more.'

/** Same rule as the backend AddOnSelectionValidator: Left or Right covers up to 5 nails, Both any number. */
export function validateHand(hand, nailCount) {
  if (!['Left', 'Right', 'Both'].includes(hand)) return HAND_REQUIRED_MESSAGE
  if (hand !== 'Both' && nailCount > LIMITS.maxNailsPerHand) return HAND_TOO_MANY_MESSAGE
  return null
}

export function validateFeedback(values) {
  const rating = Number(values.rating)
  return collect([
    ['rating', Number.isInteger(rating) && rating >= 1 && rating <= 5 ? null : 'Choose a rating from 1 to 5 stars.'],
    ['comment', String(values.comment ?? '').length > LIMITS.feedbackCommentMax
      ? `Comments must be ${LIMITS.feedbackCommentMax} characters or fewer.` : null],
  ])
}

export const hasErrors = (errors) => Object.keys(errors).length > 0
