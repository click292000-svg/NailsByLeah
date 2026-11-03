import { config } from '../config'
import { ApiError } from './errors'

/**
 * Real transport: calls the C# API. The session is an HttpOnly cookie, so requests send credentials.
 * `form` (a FormData) sends a multipart upload instead of a JSON body.
 */
export async function httpRequest(method, path, { body, query, form } = {}) {
  const url = new URL(config.apiBaseUrl.replace(/\/$/, '') + path, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }

  const headers = { Accept: 'application/json' }
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers,
      // The browser sets the multipart Content-Type (with its boundary) for FormData itself.
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
  } catch {
    throw ApiError.network()
  }

  if (response.status === 204) return null
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // e.g. the server's own 413 page for a request that was far too large
  }
  if (!response.ok) throw ApiError.fromProblem(response.status, data)
  return data
}
