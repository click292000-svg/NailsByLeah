// Small helpers shared by the animated home page sections.

// Browsers without these (and the jsdom test environment) get the still version of the page.
export const canAnimate = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && 'IntersectionObserver' in window
export const prefersReducedMotion = () => !canAnimate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const hasMouse = () => canAnimate && window.matchMedia('(hover: hover) and (pointer: fine)').matches

export const lerp = (a, b, t) => a + (b - a) * t
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const smooth = (t) => t * t * (3 - 2 * t)
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/* Intro: plays on the first home page visit of a browser session. */
export const INTRO_SEEN_KEY = 'nbl-intro-seen'
const WRITE_MS = 1700 // how long the left-to-right "writing" of the logo takes

/** Whether to play the intro and how long until the logo is written (the hero starts typing after it). */
export function planIntro() {
  if (sessionStorage.getItem(INTRO_SEEN_KEY)) return { play: false, lettersDone: 0 }
  return { play: true, lettersDone: prefersReducedMotion() ? 0 : 200 + WRITE_MS + 100 }
}

/** ₱400 (no ".00": headline prices read cleaner without centavos). */
export const peso = (amount) => `₱${Number(amount ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`

export const photo = (n) => `/img/nails-${String(n).padStart(2, '0')}.jpg`
export const closeup = (n) => `/img/closeup-${String(n).padStart(2, '0')}.jpg`

/** Scroll progress through a tall "sticky" section: 0 when its top reaches the top of the screen, 1 when its end does. */
export function progress(section) {
  const total = section.offsetHeight - window.innerHeight
  return total > 0 ? clamp(-section.getBoundingClientRect().top / total, 0, 1) : 0
}

/** Mouse position across the window, from -0.5 to 0.5 on each axis (one shared listener). */
export const pointer = { x: 0, y: 0, clientX: 0, clientY: 0 }
let pointerUsers = 0
const onMove = (e) => {
  pointer.x = e.clientX / window.innerWidth - 0.5
  pointer.y = e.clientY / window.innerHeight - 0.5
  pointer.clientX = e.clientX
  pointer.clientY = e.clientY
}
export function trackPointer() {
  if (!hasMouse() || prefersReducedMotion()) return () => {}
  if (pointerUsers++ === 0) window.addEventListener('mousemove', onMove, { passive: true })
  return () => { if (--pointerUsers === 0) window.removeEventListener('mousemove', onMove) }
}

/* Smooth, eased scrolling: longer trips take a little longer (600–1400 ms); scrolling or touching the page stops it. */
let scrollAnim = 0
const stopGlide = () => cancelAnimationFrame(scrollAnim)
if (typeof window !== 'undefined') {
  for (const ev of ['wheel', 'touchstart', 'keydown']) window.addEventListener(ev, stopGlide, { passive: true })
}

function glideTo(y) {
  stopGlide()
  const startY = window.scrollY
  const dist = y - startY
  if (prefersReducedMotion() || Math.abs(dist) < 2) { window.scrollTo(0, y); return }
  const duration = clamp(400 + Math.abs(dist) * 0.12, 600, 1400)
  const t0 = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration)
    window.scrollTo(0, startY + dist * easeInOutCubic(t))
    if (t < 1) scrollAnim = requestAnimationFrame(step)
  }
  scrollAnim = requestAnimationFrame(step)
}

/** Glides to a home page section (the hero means the very top) and moves keyboard focus there. */
export function scrollToSection(id) {
  const target = document.getElementById(id)
  if (!target) return
  const header = document.querySelector('.site-header')?.offsetHeight ?? 0
  glideTo(id === 'hero' ? 0 : Math.max(0, target.getBoundingClientRect().top + window.scrollY - header))
  target.focus({ preventScroll: true })
}
