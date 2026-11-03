import { useEffect, useRef, useState } from 'react'
import { INTRO_SEEN_KEY, prefersReducedMotion } from './motion'

const Sparkle = ({ style }) => (
  <svg className="hm-sparkle" style={style} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 0l2.4 9.6L24 12l-9.6 2.4L12 24l-2.4-9.6L0 12l9.6-2.4z" />
  </svg>
)

/** Leyah's logo is written across a blush screen, sparkles twinkle, then the curtain lifts. */
export function Intro({ plan }) {
  const [stage, setStage] = useState(plan.play ? 'start' : 'gone')
  const img = useRef(null)

  useEffect(() => {
    if (!plan.play) return undefined
    sessionStorage.setItem(INTRO_SEEN_KEY, '1')
    const reduce = prefersReducedMotion()
    const hideAt = reduce ? 300 : plan.lettersDone + 1000
    const timers = []
    let cancelled = false
    // Start once the logo has loaded (or after 1.5 s at the latest) so the wipe never runs over an empty image.
    const ready = img.current?.decode ? img.current.decode().catch(() => {}) : Promise.resolve()
    Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
      if (cancelled) return
      timers.push(setTimeout(() => setStage('show'), reduce ? 0 : 200))
      timers.push(setTimeout(() => setStage('done'), plan.lettersDone))
      timers.push(setTimeout(() => setStage('hidden'), hideAt))
      timers.push(setTimeout(() => setStage('gone'), hideAt + 700))
    })
    return () => { cancelled = true; timers.forEach(clearTimeout) }
  }, [plan])

  if (stage === 'gone') return null
  const classes = ['hm-intro', (stage === 'done' || stage === 'hidden') && 'is-done', stage === 'hidden' && 'is-hidden'].filter(Boolean).join(' ')
  return (
    <div className={classes} aria-hidden="true">
      <div className={stage === 'start' ? 'hm-intro-logo' : 'hm-intro-logo show'}>
        <img ref={img} src="/img/logo.png" width="1000" height="455" alt="" />
        <Sparkle style={{ left: -26, top: -6 }} />
        <Sparkle style={{ right: -24, top: 4 }} />
        <Sparkle style={{ left: '45%', bottom: -24 }} />
      </div>
    </div>
  )
}
