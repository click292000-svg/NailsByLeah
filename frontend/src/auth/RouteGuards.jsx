import { Navigate, useLocation } from 'react-router'
import { homeFor, useAuth } from './AuthContext'
import { PageLoader } from '../components/ui'

/**
 * Role-based route guard (Ref 8.7). Signed-out visitors go to the login page; a signed-in user
 * with the wrong role goes to their own home page with an "access denied" message.
 * The backend enforces the same rules on every API call.
 */
export function RequireRole({ role, children }) {
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready) return <PageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace state={{ accessDenied: true }} />
  return children
}

/** Any signed-in user, client or administrator (their own profile). */
export function SignedIn({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <PageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

/** Login, registration and password pages are for signed-out visitors only. */
export function GuestOnly({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return <PageLoader />
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return children
}
