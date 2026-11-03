/**
 * Error thrown by every API call, real or mock. Mirrors the backend's ProblemDetails:
 * status, a human-readable message, a machine-readable code (e.g. "slot_unavailable")
 * and per-field validation errors ({ username: ["Username is already taken."] }).
 */
export class ApiError extends Error {
  constructor({ status, message, code = null, errors = {} }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.errors = errors ?? {}
  }

  /** First message for a field, or null. */
  fieldError(field) {
    return this.errors[field]?.[0] ?? null
  }

  static fromProblem(status, problem) {
    return new ApiError({
      status,
      message: problem?.detail || problem?.title || defaultMessage(status),
      code: problem?.code ?? null,
      errors: problem?.errors ?? {},
    })
  }

  static network() {
    return new ApiError({ status: 0, message: 'Unable to reach the server. Check your connection and try again.', code: 'network_error' })
  }
}

function defaultMessage(status) {
  if (status === 401) return 'Please log in to continue.'
  if (status === 403) return "You don't have access to this."
  if (status === 404) return 'Not found.'
  if (status === 413) return 'The file is too large.'
  if (status >= 500) return 'Something went wrong on our side. Please try again later.'
  return 'The request could not be completed.'
}

/** Field errors as { field: "first message" } for forms. */
export function fieldErrors(error) {
  if (!(error instanceof ApiError)) return {}
  return Object.fromEntries(Object.entries(error.errors).map(([field, messages]) => [field, messages[0]]))
}

/** Message to show for any thrown value. */
export function errorMessage(error) {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}
