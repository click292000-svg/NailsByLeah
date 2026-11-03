import { useEffect, useRef, useState } from 'react'
import { canAnimate, clamp, closeup, easeInOutCubic, lerp, peso, pointer, prefersReducedMotion, progress, smooth, trackPointer } from './motion'

// The landscape photos are the original shot centred on a blurred fill; band = the sharp shot's share of the width.
// fx/fy: the nail to zoom into, as a fraction of the whole landscape image. Prices come from the live price list
// (an add-on by name, or a main service by category + name), with the approved price as a fallback.
const STOPS = [
  { n: 6, band: 0.42, fx: 0.546, fy: 0.52, zoom: 2.6, title: 'Classic French', text: 'A crisp white tip on a sheer nude almond.', label: 'French Tip', addOn: 'French Tip', fallback: 15 },
  { n: 1, band: 0.42, fx: 0.487, fy: 0.51, zoom: 2.6, title: 'Lace & silver studs', text: 'Hand-painted lace with tiny silver beads.', label: 'Soft Gel with design', service: ['SoftGel', 'With Design'], fallback: 400 },
  { n: 2, band: 0.56, fx: 0.568, fy: 0.37, zoom: 2.4, title: 'Cat eye & leopard', text: 'A magnetic shimmer paired with hand-drawn spots.', label: 'Cat Eye Polish', addOn: 'Cat Eye Polish', fallback: 10 },
  { n: 8, band: 0.42, fx: 0.538, fy: 0.44, zoom: 2.5, title: 'Blooming gel', text: 'Colour that spreads like ink in water.', label: 'Blooming Gel', addOn: 'Blooming Gel', fallback: 10 },
  { n: 11, band: 0.42, fx: 0.483, fy: 0.54, zoom: 2.4, title: 'Embossed gold', text: 'Raised gold detail, pearls and a deep wine base.', label: 'Embossed Art', addOn: 'Embossed Art', fallback: 15 },
  { n: 5, band: 0.42, fx: 0.53, fy: 0.61, zoom: 2.3, title: '3D flowers', text: 'Sculpted petals with gold studs and polka dots.', label: 'Soft Gel with design', service: ['SoftGel', 'With Design'], fallback: 400 },
]

const same = (a, b) => a?.trim().toLowerCase() === b.toLowerCase()
function priceOf(stop, catalog) {
  const item = stop.addOn
    ? catalog?.addOns.find((a) => same(a.name, stop.addOn))
    : catalog?.services.find((s) => s.category === stop.service[0] && same(s.name, stop.service[1]))
  return item?.price ?? stop.fallback
}

const TRANS_MS = 1100
const two = (n) => String(n).padStart(2, '0')

// Draws a photo so that point (cx, cy) sits in the middle of the screen, without showing empty edges once the
// photo is bigger than the screen. zoom 1 = the photo covers the screen; zoom z = z times the size at which the
// sharp centre band just fits, so close-ups look the same on phones and desktops. scale grows the finished
// picture around the screen centre (used by the dissolve). Returns where the sharp band sits on screen: [left, right].
function drawPhoto(ctx, W, H, img, cx, cy, zoom, alpha, band, scale = 1) {
  if (!img.complete || !img.naturalWidth) return null
  const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const bandFit = Math.min(W / (img.naturalWidth * band), H / img.naturalHeight)
  const s = Math.max(cover, bandFit * zoom)
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s
  const x = dw > W ? clamp(W / 2 - cx * dw, W - dw, 0) : (W - dw) / 2
  const y = dh > H ? clamp(H / 2 - cy * dh, H - dh, 0) : (H - dh) / 2
  const left = W / 2 + (x - W / 2) * scale
  if (alpha > 0) {
    ctx.globalAlpha = alpha
    ctx.drawImage(img, left, H / 2 + (y - H / 2) * scale, dw * scale, dh * scale)
  }
  const bandW = dw * scale * band
  const l = left + (dw * scale - bandW) / 2
  return [l, l + bandW]
}

// Covers the photo's blurred side fill with a blush backdrop, so the sharp shot reads as a card on the page colours.
// The shadow along each edge lifts the card off the backdrop. Nothing is drawn once the shot fills the screen.
function drawBackdrop(ctx, W, H, [l, r]) {
  const side = (from, to) => {
    if (Math.abs(to - from) < 1) return
    const g = ctx.createLinearGradient(to, 0, from, 0) // from the photo edge outwards
    g.addColorStop(0, 'rgba(104,44,67,.22)')
    g.addColorStop(Math.min(1, 26 / Math.abs(to - from)), 'rgba(248,228,235,.94)')
    g.addColorStop(1, 'rgba(255,248,244,.97)')
    ctx.fillStyle = g
    ctx.fillRect(Math.min(from, to), 0, Math.abs(to - from), H)
  }
  ctx.globalAlpha = 1
  side(0, Math.max(0, l))
  side(W, Math.min(W, r))
}

// Each stop: zoom in (first 35%), hold on the nail, zoom back out (last 25%).
function shotAt(t) {
  const s = t * STOPS.length
  const i = Math.min(STOPS.length - 1, Math.floor(s))
  const u = s - i
  const stop = STOPS[i]
  const k = u < 0.35 ? smooth(u / 0.35) : u < 0.75 ? 1 : 1 - smooth((u - 0.75) / 0.25)
  return { i, u, cx: lerp(0.5, stop.fx, k), cy: lerp(0.5, stop.fy, k), zoom: lerp(1, stop.zoom, k) }
}

/** "Up close": the section stays on screen while scrolling zooms into one nail per photo; photos change with a dissolve. */
export function CloseupTour({ catalog }) {
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const introRef = useRef(null)
  const stepRefs = useRef([])
  const [active, setActive] = useState(0) // the nail the scroll position is on
  const [shown, setShown] = useState(0) // the nail the caption shows (follows `active` after the caption fades out)
  const swapping = active !== shown

  useEffect(() => {
    if (active === shown) return undefined
    const timer = setTimeout(() => setShown(active), prefersReducedMotion() ? 0 : 200)
    return () => clearTimeout(timer)
  }, [active, shown])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canAnimate ? canvas.getContext('2d', { alpha: false }) : null
    if (!ctx) return undefined
    const section = sectionRef.current
    const reduce = prefersReducedMotion()
    const untrack = trackPointer()
    const imgs = STOPS.map((s) => { const img = new Image(); img.src = closeup(s.n); return img })

    let W = 0, H = 0
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      W = canvas.clientWidth; H = canvas.clientHeight
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    window.addEventListener('resize', resize, { passive: true })
    resize()

    let visible = false
    const watch = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    watch.observe(section)

    const cam = { cx: 0.5, cy: 0.5, zoom: 1 }
    let photoIdx = -1, trans = null, lastI = -1, raf

    // Dissolve: the old photo drifts forward and softens while the new one settles in from slightly larger,
    // with a faint blush glow at the midpoint. Timed, so it stays smooth even on a fast flick.
    const drawTransition = (prev, next, p) => {
      const e = easeInOutCubic(p)
      const pc = trans.cam
      ctx.filter = `blur(${(e * 8).toFixed(1)}px)`
      const a = drawPhoto(ctx, W, H, imgs[prev], pc.cx, pc.cy, pc.zoom, 1, STOPS[prev].band, 1 + 0.06 * e)
      ctx.filter = 'none'
      const b = drawPhoto(ctx, W, H, imgs[next], cam.cx, cam.cy, cam.zoom, e, STOPS[next].band, 1.06 - 0.06 * e)
      ctx.globalAlpha = 0.35 * Math.sin(Math.PI * e)
      ctx.fillStyle = '#fdf2f6'
      ctx.fillRect(0, 0, W, H)
      // The card edges glide from one photo's width to the next.
      return a && b ? [lerp(a[0], b[0], e), lerp(a[1], b[1], e)] : a ?? b
    }

    const frame = () => {
      raf = requestAnimationFrame(frame)
      if (!visible) return
      const ease = reduce ? 1 : 0.1
      const t = progress(section)
      const shot = shotAt(t)
      cam.cx = lerp(cam.cx, shot.cx + pointer.x * 0.02, ease)
      cam.cy = lerp(cam.cy, shot.cy + pointer.y * 0.02, ease)
      cam.zoom = lerp(cam.zoom, shot.zoom, ease)
      ctx.globalAlpha = 1
      ctx.fillStyle = '#fdf2f6'
      ctx.fillRect(0, 0, W, H)
      const now = performance.now()
      if (shot.i !== photoIdx) {
        // Start from wherever the old photo is (or was, if a transition was still running).
        if (photoIdx >= 0 && !reduce) trans = { from: photoIdx, start: now, cam: trans ? trans.cam : { ...cam } }
        photoIdx = shot.i
      }
      const p = trans ? (now - trans.start) / TRANS_MS : 1
      if (p >= 1) trans = null
      const edges = trans ? drawTransition(trans.from, shot.i, p) : drawPhoto(ctx, W, H, imgs[shot.i], cam.cx, cam.cy, cam.zoom, 1, STOPS[shot.i].band)
      if (edges) drawBackdrop(ctx, W, H, edges)
      // Soft rose vignette: ties the photos to the page colours and keeps the heading readable.
      ctx.globalAlpha = 1
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
      g.addColorStop(0, 'rgba(253,242,246,0)'); g.addColorStop(1, 'rgba(251,228,236,.55)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      if (shot.i !== lastI) { lastI = shot.i; setActive(shot.i) }
      introRef.current?.classList.toggle('gone', t > 0.03)
      // One segment per nail: earlier ones full, the current one fills as you scroll through it.
      stepRefs.current.forEach((b, j) => { if (b) b.style.width = j < shot.i ? '100%' : j === shot.i ? `${shot.u * 100}%` : '0%' })
    }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); watch.disconnect(); window.removeEventListener('resize', resize); untrack() }
  }, [])

  const stop = STOPS[shown]
  return (
    <section className="hm-tour hm-section" id="tour" ref={sectionRef} tabIndex={-1} aria-label="Up close">
      <div className="hm-tour-sticky">
        <canvas ref={canvasRef} role="img" aria-label="Close-ups of Leyah's nail sets" />
        <div className="hm-tour-intro" ref={introRef}><h2>Up close</h2><p>Keep scrolling to zoom into each set.</p></div>
        <div className="hm-panel" aria-live="polite">
          <div className="hm-panel-top">
            <span className="hm-panel-num"><em>{two(shown + 1)}</em> / {two(STOPS.length)}</span>
            <span className="hm-steps" aria-hidden="true">
              {STOPS.map((s, j) => <i key={s.n}><b ref={(el) => { stepRefs.current[j] = el }} /></i>)}
            </span>
          </div>
          <div className={swapping ? 'hm-swap out' : 'hm-swap'}>
            <h3>{stop.title}</h3>
            <p className="hm-panel-text">{stop.text}</p>
            <div className="hm-panel-price">
              <span className="hm-panel-service">{stop.label}</span>
              <span className="hm-panel-amount">
                {stop.addOn ? <>+{peso(priceOf(stop, catalog))}<small>/ nail</small></> : peso(priceOf(stop, catalog))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
