import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Alert } from './ui'
import { salon } from '../mock/data/salon'
import { config } from '../config'

const YEAR = new Date().getFullYear()

const clientLinks = [
  { to: '/book', label: 'Book now' },
  { to: '/bookings', label: 'My bookings' },
]

const adminLinks = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/bookings', label: 'Bookings' },
  { to: '/admin/services', label: 'Services' },
  { to: '/admin/schedule', label: 'Schedule' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/activity', label: 'Activity log' },
]

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Both are tied to the current location, so navigating closes the mobile menu and
  // the guard's "access denied" message shows once per redirect.
  const [menuOpenAt, setMenuOpenAt] = useState(null)
  const [dismissedAt, setDismissedAt] = useState(null)
  const menuOpen = menuOpenAt === location.key
  const setMenuOpen = (update) => setMenuOpenAt((update(menuOpen) ? location.key : null))
  const accessDenied = Boolean(location.state?.accessDenied) && dismissedAt !== location.key
  const setAccessDenied = () => setDismissedAt(location.key)

  const isAdmin = user?.role === 'Administrator'
  const isHome = location.pathname === '/'
  const links = isAdmin ? adminLinks : user ? clientLinks : []
  // Explore and Pricing glide to their home page section (HomePage reads the hash).
  const homeLinks = isAdmin ? [] : [{ to: '/#tour', label: 'Explore' }, { to: '/#prices', label: 'Pricing' }]

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <Link to={isAdmin ? '/admin' : '/'} className="brand">
            <img src="/img/logo.png" width="690" height="264" alt={salon.name} />
          </Link>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="site-nav"
            onClick={() => setMenuOpen((open) => !open)}>
            <span className="sr-only">Menu</span>
            <span className="menu-bars" aria-hidden="true" />
          </button>
          <nav id="site-nav" className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label="Main">
            {homeLinks.map((link) => (
              <Link key={link.to} to={link.to} className="nav-link">{link.label}</Link>
            ))}
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">{link.label}</NavLink>
            ))}
            {user ? (
              <div className="nav-user">
                <span className="nav-greeting">Hi, {user.firstName}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>Log out</button>
              </div>
            ) : (
              <div className="nav-user">
                <NavLink to="/login" className="nav-link">Log in</NavLink>
                <Link to="/register" className="btn btn-primary btn-sm">Sign up</Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className={isHome ? 'page page-home' : 'page'}>
        {accessDenied && (
          <Alert kind="warning" onClose={setAccessDenied}>
            You don&apos;t have access to that page, so we brought you here instead.
          </Alert>
        )}
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span>© {YEAR} {salon.name}</span>
          <span>{salon.hours}</span>
          {config.useMockApi && <span className="mock-badge">Demo mode: mock data</span>}
        </div>
      </footer>
    </div>
  )
}
