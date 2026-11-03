import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, onUnauthorized } from '../api'
import { config } from '../config'

const AuthContext = createContext(null)

export const IDLE_LOGOUT_MESSAGE = 'You were logged out after 30 minutes of inactivity. Please log in again.'
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  // A one-time message for the login page, e.g. after an automatic logout.
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true))
  }, [])

  useEffect(() => onUnauthorized(() => {
    setUser((current) => {
      if (current) setNotice(SESSION_EXPIRED_MESSAGE)
      return null
    })
  }), [])

  const login = useCallback(async (credentials) => {
    const profile = await api.auth.login(credentials)
    setUser(profile)
    setNotice(null)
    return profile
  }, [])

  const logout = useCallback(async (message = null) => {
    try {
      await api.auth.logout()
    } catch {
      // Already signed out on the server; nothing else to do.
    }
    setUser(null)
    setNotice(message)
  }, [])

  const clearNotice = useCallback(() => setNotice(null), [])

  const value = useMemo(() => ({ user, ready, login, logout, notice, clearNotice }), [user, ready, login, logout, notice, clearNotice])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.')
  return context
}

export const homeFor = (role) => (role === 'Administrator' ? '/admin' : '/bookings')

/** Whether a role may open a path; matches the guards in App.jsx. */
export function canOpen(role, path) {
  if (path.startsWith('/admin')) return role === 'Administrator'
  if (path.startsWith('/book') || path.startsWith('/messages')) return role === 'Client'
  return true
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']

/**
 * Logs the user out after `sessionIdleMinutes` without mouse, keyboard, scroll or touch
 * activity and sends them to the login page with a message (Ref 8.4).
 */
export function IdleLogout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const timer = useRef(null)
  const lastReset = useRef(0)

  useEffect(() => {
    if (!user) return undefined
    const timeoutMs = config.sessionIdleMinutes * 60_000

    const expire = async () => {
      await logout(IDLE_LOGOUT_MESSAGE)
      navigate('/login', { replace: true })
    }
    const restart = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(expire, timeoutMs)
    }
    const onActivity = () => {
      // Restarting the timer at most once a second keeps mousemove cheap.
      if (Date.now() - lastReset.current < 1000) return
      lastReset.current = Date.now()
      restart()
    }

    restart()
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }))
    return () => {
      clearTimeout(timer.current)
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity))
    }
  }, [user, logout, navigate])

  return null
}
