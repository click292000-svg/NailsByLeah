import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { AdminNav, ClientAccountMenu } from './AdminNav'
import { ErrorBoundary } from './ErrorBoundary'
import { useAuth } from '../auth/AuthContext'
import { Alert } from './ui'
import { SocialLinks } from './SocialLinks'
import { LegalDocumentModal } from './Modal'
import { salon } from '../content/salon'
import { formatPhone, useSalon } from './SalonProfile'
import { apiPhotoSrc } from '../lib/photos'

const YEAR = new Date().getFullYear()

const clientLinks = [
  { to: '/book', label: 'Book now' },
  { to: '/bookings', label: 'My bookings' },
  { to: '/feedback', label: 'Rate us' },
]

export function Layout() {
  const { user, logout } = useAuth()
  const { phone } = useSalon()
  const [legalDocument, setLegalDocument] = useState(null)
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
  const links = user ? clientLinks : []
  // Explore and Pricing glide to their home page section (HomePage reads the hash).
  const homeLinks = [{ to: '/#tour', label: 'Explore' }, { to: '/#prices', label: 'Pricing' }]

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className={isAdmin ? 'header-inner header-admin' : 'header-inner'}>
          <Link to={isAdmin ? '/admin' : '/'} className="brand">
            <img src="/img/logo-header.webp" width="360" height="164" alt={salon.name} />
          </Link>
          <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="site-nav"
            onClick={() => setMenuOpen((open) => !open)}>
            <span className="sr-only">Menu</span>
            <span className="menu-bars" aria-hidden="true" />
          </button>
          {isAdmin ? (
            <AdminNav user={user} onSignOut={signOut} menuOpen={menuOpen} />
          ) : (
            <nav id="site-nav" className={menuOpen ? 'site-nav open' : 'site-nav'} aria-label="Main">
              {homeLinks.map((link) => (
                <Link key={link.to} to={link.to} className="nav-link">{link.label}</Link>
              ))}
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
                  {link.label}
                </NavLink>
              ))}
              {user ? (
                <ClientAccountMenu user={user} photo={apiPhotoSrc(user.photoUrl, user.photoDataUrl)} onSignOut={signOut} />
              ) : (
                <div className="nav-user">
                  <NavLink to="/login" className="nav-link">Log in</NavLink>
                  <Link to="/register" className="btn btn-primary btn-sm">Sign up</Link>
                </div>
              )}
            </nav>
          )}
        </div>
      </header>

      <main id="main" className={isHome ? 'page page-home' : 'page'}>
        {accessDenied && (
          <Alert kind="warning" onClose={setAccessDenied}>
            You don&apos;t have access to that page, so we brought you here instead.
          </Alert>
        )}
        {/* Keyed by page, so moving to another page clears the error. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="site-footer">
        {/* One slim row: copyright, legal links, social icons (no logo here: the header already shows it). */}
        <div className="footer-inner">
          <p className="footer-copy">
            © {YEAR} {salon.name}
            {phone && <> · <a className="footer-phone" href={`tel:${phone}`}>Call or text {formatPhone(phone)}</a></>}
          </p>
          <nav className="footer-links" aria-label="Footer">
            <button type="button" onClick={() => setLegalDocument('terms')}>Terms &amp; Conditions</button>
            <span aria-hidden="true">•</span>
            <button type="button" onClick={() => setLegalDocument('privacy')}>Privacy Policy</button>
          </nav>
          <SocialLinks variant="plain" className="footer-social" />
        </div>
      </footer>
      {legalDocument && <LegalDocumentModal document={legalDocument} onClose={() => setLegalDocument(null)} />}
    </div>
  )
}
