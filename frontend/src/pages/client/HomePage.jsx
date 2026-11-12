import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { api } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { policies, schedule } from '../../content/salon'
import { formatHours } from '../../lib/format'
import { Intro } from './home/Intro'
import { Hero } from './home/Hero'
import { CloseupTour } from './home/CloseupTour'
import { PhotoViewer, WorksGallery } from './home/WorksGallery'
import { PricingSection } from './home/PricingSection'
import { FaqSection, RulesSection } from './home/RulesAndFaq'
import { Location } from './home/InfoCards'
import { canAnimate, peso, planIntro, scrollToSection } from './home/motion'
import '../../styles/home.css'

export { Location } from './home/InfoCards'

// Header links that follow the section on screen (see Layout: Explore → #tour, Pricing → #prices).
const SPY_SECTIONS = ['tour', 'prices']

/** Animated landing page: intro, hero, "Up close" tour, Our Works, Pricing, Nail Rules, FAQ and Find us. */
export default function HomePage() {
  const { user } = useAuth()
  const location = useLocation()
  const rootRef = useRef(null)
  const toTopRef = useRef(null)
  const [intro] = useState(planIntro)
  const catalog = useAsync(() => api.catalog.get(), [])
  const deposit = peso(catalog.data?.depositAmount ?? policies.depositAmount)
  // Opening hours from the API: the closing time is set by Leyah on the admin Schedule page.
  const salonHours = useAsync(() => api.catalog.hours(), [])
  const hours = formatHours(salonHours.data ?? { openingTime: schedule.openingTime, closingTime: schedule.defaultClosingTime })
  const bookTo = user ? '/book' : '/register'
  // Shown once, after sign-up and email verification.
  const navigate = useNavigate()
  const welcome = location.state?.welcome === 'verified'
  const dismissWelcome = () => navigate(location.pathname + location.hash, { replace: true, state: null })

  // Photo viewer (Our Works photos); focus goes back to whatever opened it.
  const [viewer, setViewer] = useState({ open: false, photo: null })
  const opener = useRef(null)
  const openPhoto = useCallback((photo, from) => { opener.current = from; setViewer({ open: true, photo }) }, [])
  const closePhoto = useCallback(() => {
    setViewer((v) => ({ ...v, open: false }))
    opener.current?.focus({ preventScroll: true })
    opener.current = null
  }, [])

  // In-page buttons glide to their section instead of jumping.
  const jump = useCallback((id) => (e) => { e.preventDefault(); scrollToSection(id) }, [])

  // Header links (/#tour, /#prices) and links from other pages land here with a hash: glide to that section.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (id) scrollToSection(id)
  }, [location.key, location.hash])

  useEffect(() => {
    const root = rootRef.current
    const reveals = root.querySelectorAll('.hm-reveal')
    if (!canAnimate) { reveals.forEach((el) => { el.dataset.in = '' }); return undefined }

    // Cards fade in as they scroll into view.
    const revealer = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.dataset.in = ''; revealer.unobserve(e.target) }
    }), { threshold: 0.15 })
    reveals.forEach((el) => revealer.observe(el))

    // The header link for the section crossing the middle of the screen is highlighted.
    const html = document.documentElement
    const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) html.dataset.homeSection = e.target.id
      else if (html.dataset.homeSection === e.target.id) delete html.dataset.homeSection
    }), { rootMargin: '-50% 0px -50% 0px' })
    SPY_SECTIONS.forEach((id) => spy.observe(document.getElementById(id)))

    // Back-to-top shows once the hero is off screen.
    const hero = new IntersectionObserver(([e]) => toTopRef.current?.classList.toggle('show', !e.isIntersecting))
    hero.observe(document.getElementById('hero'))

    return () => { revealer.disconnect(); spy.disconnect(); hero.disconnect(); delete html.dataset.homeSection }
  }, [])

  return (
    <div className="home" ref={rootRef}>
      {welcome && (
        <div className="hm-welcome" role="status">
          <span className="hm-welcome-check" aria-hidden="true">✓</span>
          <p><strong>Your account is ready!</strong> Your email is verified. Log in to book your first appointment.</p>
          {!user && <Link to="/login" className="btn btn-primary btn-sm">Log in</Link>}
          <button type="button" className="hm-welcome-close" onClick={dismissWelcome} aria-label="Dismiss">×</button>
        </div>
      )}
      <Intro plan={intro} />
      <Hero bookTo={bookTo} deposit={deposit} typingStartsAfter={intro.lettersDone + 900} onJump={jump} />
      <CloseupTour catalog={catalog.data} />
      <WorksGallery onOpen={openPhoto} />
      <PricingSection catalog={catalog} bookTo={bookTo} />
      <RulesSection deposit={deposit} />
      <FaqSection deposit={deposit} hours={hours} />
      <section className="hm-find hm-section" id="find-us" tabIndex={-1} aria-labelledby="find-us-title">
        <Location hours={hours} />
      </section>
      <PhotoViewer photo={viewer.photo} open={viewer.open} onClose={closePhoto} />
      <button type="button" className="hm-to-top" ref={toTopRef} aria-label="Back to top" onClick={() => scrollToSection('hero')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  )
}
