import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useSalon } from './SalonProfile'

const GROUPS = [
  {
    id: 'management',
    label: 'Management',
    links: [
      { to: '/admin/bookings', label: 'Bookings' },
      { to: '/admin/services', label: 'Services' },
      { to: '/admin/schedule', label: 'Schedule' },
      { to: '/admin/clients', label: 'Clients' },
      { to: '/admin/gallery', label: 'Gallery' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    links: [
      { to: '/admin/reports', label: 'Reports' },
      { to: '/admin/feedback', label: 'Feedback' },
      { to: '/admin/activity', label: 'Activity log' },
    ],
  },
]

const isWithin = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`)

const Chevron = () => (
  <svg className="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/**
 * A button that shows a panel of links. Click or Enter/Space toggles it; Arrow Down opens it and moves in; arrows,
 * Home and End move between items; Escape closes it and returns to the button; leaving it closes it.
 * On phones the same panel expands in place inside the hamburger menu (see .nav-panel in app.css).
 */
function NavDropdown({ id, open, onToggle, onClose, active, align, triggerClass = '', label, children }) {
  const button = useRef(null)
  const panel = useRef(null)
  const focusFirst = useRef(false)
  const items = () => [...(panel.current?.querySelectorAll('a, button') ?? [])]

  useEffect(() => {
    if (open && focusFirst.current) items()[0]?.focus()
    focusFirst.current = false
  }, [open])

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      onClose()
      button.current?.focus()
      return
    }
    if (e.target === button.current) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (open) items()[0]?.focus()
        else {
          focusFirst.current = true
          onToggle()
        }
      }
      return
    }
    const list = items()
    const here = list.indexOf(e.target)
    const next = { ArrowDown: here + 1, ArrowUp: here - 1, Home: 0, End: list.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    list[(next + list.length) % list.length]?.focus()
  }

  return (
    <div className={open ? 'nav-dropdown open' : 'nav-dropdown'} onKeyDown={onKeyDown}
      onBlur={(e) => { if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) onClose() }}>
      <button ref={button} type="button" className={`nav-link nav-trigger ${triggerClass}${active ? ' active' : ''}`}
        aria-expanded={open} aria-controls={`nav-panel-${id}`} onClick={onToggle}>
        {label}
        <Chevron />
      </button>
      <div ref={panel} id={`nav-panel-${id}`} className={align === 'end' ? 'nav-panel nav-panel-end' : 'nav-panel'} inert={!open}>
        <div className="nav-panel-inner">{children}</div>
      </div>
    </div>
  )
}

/** The administrator's menu: Dashboard, then related pages grouped under Management and Insights, then the profile. */
export function AdminNav({ user, onSignOut, menuOpen }) {
  const { pathname } = useLocation()
  const [openId, setOpenId] = useState(null)
  const [closedAt, setClosedAt] = useState(pathname)
  const nav = useRef(null)
  // Moving to another page closes any open panel, whichever way the move happened.
  if (closedAt !== pathname) {
    setClosedAt(pathname)
    setOpenId(null)
  }

  useEffect(() => {
    if (!openId) return undefined
    const away = (e) => { if (!nav.current?.contains(e.target)) setOpenId(null) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [openId])

  const close = () => setOpenId(null)
  const toggle = (id) => () => setOpenId((current) => (current === id ? null : id))
  const initial = user.firstName?.trim()[0]?.toUpperCase() ?? '?'
  const { photo } = useSalon() // Leyah's photo from her profile

  return (
    <nav ref={nav} id="site-nav" className={menuOpen ? 'site-nav site-nav-admin open' : 'site-nav site-nav-admin'} aria-label="Main">
      <NavLink to="/admin" end className="nav-link" onClick={close}>Dashboard</NavLink>
      {GROUPS.map((group) => (
        <NavDropdown key={group.id} id={group.id} label={group.label} open={openId === group.id} onToggle={toggle(group.id)} onClose={close}
          active={group.links.some((link) => isWithin(pathname, link.to))}>
          {group.links.map((link) => (
            <NavLink key={link.to} to={link.to} className="nav-panel-link" onClick={close}>{link.label}</NavLink>
          ))}
        </NavDropdown>
      ))}
      <div className="nav-profile">
        <NavDropdown id="profile" align="end" triggerClass="nav-profile-trigger" open={openId === 'profile'} onToggle={toggle('profile')} onClose={close}
          label={<><span className="nav-avatar" aria-hidden="true">{photo ? <img src={photo} alt="" /> : initial}</span><span className="sr-only">Account: </span><span className="nav-profile-name">{user.firstName}</span></>}>
          <div className="nav-account">
            <strong>{user.firstName} {user.lastName}</strong>
            <span className="nav-account-role">Administrator</span>
          </div>
          <NavLink to="/profile" className="nav-panel-link" onClick={close}>My profile</NavLink>
          <button type="button" className="nav-panel-link nav-signout" onClick={onSignOut}>Log out</button>
        </NavDropdown>
      </div>
    </nav>
  )
}

/**
 * A client's account menu, laid out like Leyah's: their photo (or initial) and first name, opening to who they are signed
 * in as (name and role), My profile and Log out (My bookings is already in the top bar). Clicking elsewhere or moving to another page closes it.
 */
export function ClientAccountMenu({ user, photo, onSignOut }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [closedAt, setClosedAt] = useState(pathname)
  const box = useRef(null)
  if (closedAt !== pathname) {
    setClosedAt(pathname)
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  const close = () => setOpen(false)
  const initial = user.firstName?.trim()[0]?.toUpperCase() ?? '?'

  return (
    <div className="nav-profile" ref={box}>
      <NavDropdown id="client-account" align="end" triggerClass="nav-profile-trigger" open={open} onToggle={() => setOpen((v) => !v)} onClose={close}
        label={<><span className="nav-avatar" aria-hidden="true">{photo ? <img src={photo} alt="" /> : initial}</span><span className="sr-only">Account: </span><span className="nav-profile-name">{user.firstName}</span></>}>
        <div className="nav-account">
          <strong>{user.firstName} {user.lastName}</strong>
          <span className="nav-account-role">Client</span>
        </div>
        <NavLink to="/profile" className="nav-panel-link" onClick={close}>My profile</NavLink>
        <button type="button" className="nav-panel-link nav-signout" onClick={onSignOut}>Log out</button>
      </NavDropdown>
    </div>
  )
}
