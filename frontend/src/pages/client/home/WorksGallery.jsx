import { useEffect, useRef } from 'react'
import { api } from '../../../api'
import { useAsync } from '../../../hooks/useAsync'
import { galleryPhotoSrc } from '../../admin/GalleryPage'
import { canAnimate, lerp, photo, prefersReducedMotion, progress } from './motion'

// The built-in photos keep the rows full; Leyah's own uploads (Management > Gallery) come first.
const BUILT_IN = Array.from({ length: 13 }, (_, i) => ({ key: `set-${i + 1}`, src: photo(i + 1), alt: `Nail set ${i + 1}` }))

function Track({ items, trackRef, onOpen }) {
  return (
    <div className="hm-track" ref={trackRef}>
      {items.map((item) => (
        <button key={item.key} type="button" aria-label={`View ${item.alt}`}
          onClick={(e) => onOpen({ src: item.src, alt: item.alt }, e.currentTarget)}>
          <img src={item.src} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  )
}

/** Our Works: a row of photos above and below the title, sliding in opposite directions as you scroll. */
export function WorksGallery({ onOpen }) {
  // A gallery that can't load leaves the built-in photos; the page never waits on it.
  const uploads = useAsync(() => api.gallery.list().catch(() => []), [])
  const items = [
    ...(uploads.data ?? []).map((p) => ({ key: `photo-${p.id}`, src: galleryPhotoSrc(p), alt: p.caption ?? 'A nail set by Leyah' })),
    ...BUILT_IN,
  ]
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
        <Track items={items} trackRef={topRef} onOpen={onOpen} />
        <div className="hm-works-title">
          <h2 id="works-title">Our Works</h2>
          <p>A selection of soft gel, BIAB and nail art sets from Nails by Leyah.</p>
        </div>
        <Track items={[...items].reverse()} trackRef={bottomRef} onOpen={onOpen} />
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
