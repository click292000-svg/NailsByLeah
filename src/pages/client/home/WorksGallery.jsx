import { useEffect, useRef } from 'react'
import { canAnimate, lerp, photo, prefersReducedMotion, progress } from './motion'

const ALL = Array.from({ length: 13 }, (_, i) => i + 1)

function Track({ numbers, trackRef, onOpen }) {
  return (
    <div className="hm-track" ref={trackRef}>
      {numbers.map((n) => (
        <button key={n} type="button" aria-label={`View nail set ${n}`}
          onClick={(e) => onOpen({ src: photo(n), alt: `Nail set ${n}` }, e.currentTarget)}>
          <img src={photo(n)} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  )
}

/** Our Works: a row of photos above and below the title, sliding in opposite directions as you scroll. */
export function WorksGallery({ onOpen }) {
  const sectionRef = useRef(null)
  const topRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!canAnimate) return undefined
    const section = sectionRef.current, top = topRef.current, bottom = bottomRef.current
    const ease = prefersReducedMotion() ? 1 : 0.1
    let visible = false, xTop = 0, xBottom = 0, raf
    const watch = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    watch.observe(section)
    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (!visible) return
      const t = progress(section)
      xTop = lerp(xTop, -Math.max(0, top.scrollWidth - window.innerWidth) * t, ease)
      xBottom = lerp(xBottom, -Math.max(0, bottom.scrollWidth - window.innerWidth) * (1 - t), ease)
      top.style.transform = `translate3d(${xTop}px,0,0)`
      bottom.style.transform = `translate3d(${xBottom}px,0,0)`
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); watch.disconnect() }
  }, [])

  return (
    <section className="hm-gallery hm-section" id="gallery" ref={sectionRef} tabIndex={-1} aria-labelledby="works-title">
      <div className="hm-gallery-sticky">
        <Track numbers={ALL} trackRef={topRef} onOpen={onOpen} />
        <div className="hm-works-title">
          <h2 id="works-title">Our Works</h2>
          <p>A selection of soft gel, BIAB and nail art sets from Nails by Leah.</p>
        </div>
        <Track numbers={[...ALL].reverse()} trackRef={bottomRef} onOpen={onOpen} />
      </div>
    </section>
  )
}

/** Full-size photo. Click anywhere, × or Escape to close; focus returns to the photo that opened it. */
export function PhotoViewer({ photo: current, open, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    requestAnimationFrame(() => closeRef.current?.focus())
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={open ? 'hm-viewer open' : 'hm-viewer'} role="dialog" aria-modal="true" aria-label="Nail set photo"
      aria-hidden={!open} onClick={onClose}>
      {current && <img src={current.src} alt={current.alt} />}
      <button type="button" className="hm-viewer-close" ref={closeRef} aria-label="Close" tabIndex={open ? 0 : -1}>×</button>
    </div>
  )
}
