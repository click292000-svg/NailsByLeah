import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { canAnimate, hasMouse, lerp, photo, pointer, prefersReducedMotion, trackPointer } from './motion'

const FLOATS = [
  { cls: 'a', n: 4, depth: 1.2 },
  { cls: 'b', n: 10, depth: 0.7 },
  { cls: 'c', n: 13, depth: 0.9 },
  { cls: 'd', n: 7, depth: 1.4 },
]

/** Types each line, pauses, deletes it and moves on to the next. */
function Typed({ lines, startAfter }) {
  const [text, setText] = useState(() => (prefersReducedMotion() ? lines[0] : ''))
  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    let li = 0, current = '', deleting = false, timer
    const tick = () => {
      const full = lines[li]
      current = deleting ? full.slice(0, current.length - 1) : full.slice(0, current.length + 1)
      setText(current)
      if (!deleting && current === full) { deleting = true; timer = setTimeout(tick, 1800); return }
      if (deleting && current === '') { deleting = false; li = (li + 1) % lines.length; timer = setTimeout(tick, 300); return }
      timer = setTimeout(tick, deleting ? 22 : 45)
    }
    timer = setTimeout(tick, startAfter)
    return () => clearTimeout(timer)
  }, [lines, startAfter])
  // Screen readers get the first line once instead of every keystroke.
  return (
    <>
      <p className="hm-typed" aria-hidden="true">{text}</p>
      <p className="sr-only">{lines[0]}</p>
    </>
  )
}

/** Hero: tagline, booking buttons and photo cards that bob and drift with the mouse; a soft rose glow follows the cursor. */
export function Hero({ bookTo, deposit, typingStartsAfter, onJump }) {
  const floatRefs = useRef([])
  const glowRef = useRef(null)
  const [lines] = useState(() => [
    'Soft gel that lasts.',
    'Lace, chrome, cat eye, 3D flowers…',
    'Pick a time that suits you.',
    `Secure your slot with a ${deposit} deposit.`,
  ])

  useEffect(() => {
    if (!canAnimate || prefersReducedMotion() || !hasMouse()) return undefined
    const untrack = trackPointer()
    const glow = glowRef.current
    glow.hidden = false
    const pos = FLOATS.map(() => ({ x: 0, y: 0 }))
    let gx = window.innerWidth / 2, gy = window.innerHeight / 2, raf
    const frame = () => {
      FLOATS.forEach((f, i) => {
        const p = pos[i]
        p.x = lerp(p.x, pointer.x * 50 * f.depth, 0.1)
        p.y = lerp(p.y, pointer.y * 40 * f.depth, 0.1)
        const el = floatRefs.current[i]
        if (el) el.style.transform = `translate(${p.x}px, ${p.y}px)`
      })
      gx = lerp(gx, pointer.clientX || gx, 0.14); gy = lerp(gy, pointer.clientY || gy, 0.14)
      glow.style.transform = `translate(${gx}px, ${gy}px)`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); untrack(); glow.hidden = true }
  }, [])

  return (
    <section className="hm-hero hm-section" id="hero" tabIndex={-1}>
      <div className="hm-glow" ref={glowRef} hidden />
      {FLOATS.map((f, i) => (
        <div key={f.cls} className={`hm-float ${f.cls}`} ref={(el) => { floatRefs.current[i] = el }}>
          <div className="hm-bob"><img src={photo(f.n)} alt="" /></div>
        </div>
      ))}
      <div className="hm-hero-copy">
        <p className="hm-eyebrow">Soft gel · BIAB · Nail art</p>
        <h1>Beautiful nails, booked in minutes.</h1>
        <Typed lines={lines} startAfter={typingStartsAfter} />
        <div className="hm-hero-actions">
          <Link to={bookTo} className="btn btn-primary">Book an appointment</Link>
          <a href="#tour" className="btn btn-secondary" onClick={onJump('tour')}>See the designs</a>
        </div>
      </div>
      <span className="hm-scroll-hint" aria-hidden="true">Scroll ↓</span>
    </section>
  )
}
