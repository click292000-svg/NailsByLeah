import { config } from '../config'
import { ApiError } from './errors'

/** Real transport: calls the C# API. The session is an HttpOnly cookie, so requests send credentials. */
export async function httpRequest(method, path, { body, query } = {}) {
  const url = new URL(config.apiBaseUrl.replace(/\/$/, '') + path, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }

  let response
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw ApiError.network()
  }

  if (response.status === 204) return null
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw ApiError.fromProblem(response.status, data)
  return data
}
