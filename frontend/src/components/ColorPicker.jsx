import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LIMITS } from '../validation/rules'
import { COLLECTION, SHADE_COLORS, SHADE_NAMES, colorFor, colorLabel, perNailText, shadeNumber } from '../lib/shades'

/**
 * Two glossy gel nails in one colour, like a swatch on the salon's colour chart: almond nails with darker rims,
 * a long soft shine down the left side and a bright glint near the tip. The shading and shine are drawn over the
 * colour, so one drawing works for every shade, from white to near-black.
 */
export function NailPair({ color, className = '' }) {
  const id = useId().replace(/:/g, '')
  // An almond nail, 26 wide and 60 tall, tip at the top.
  const nail = 'M13 1C19 1 25.5 14 25.5 34S21.5 64 13 64 .5 54 .5 34 7 1 13 1Z'
  return (
    <svg className={`nail-pair ${className}`} viewBox="0 0 58 69" aria-hidden="true" focusable="false">
      <defs>
        {/* Light from the upper left: the middle lifts a little, the rims fall into shadow. */}
        <radialGradient id={`${id}b`} cx=".38" cy=".36" r=".72">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset=".8" stopColor="#000" stopOpacity=".08" />
          <stop offset="1" stopColor="#000" stopOpacity=".38" />
        </radialGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".7" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}f`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7" /></filter>
        <filter id={`${id}g`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <clipPath id={`${id}c`}><path d={nail} /></clipPath>
      </defs>
      {[{ x: 2.5, r: -3 }, { x: 29.5, r: 3 }].map(({ x, r }) => (
        <g key={x} transform={`translate(${x} 2) rotate(${r} 13 33)`}>
          <path d={nail} fill={color} />
          <g clipPath={`url(#${id}c)`}>
            <path d={nail} fill={`url(#${id}b)`} />
            <path d={nail} fill={`url(#${id}d)`} />
            {/* broad soft sheen, then the sharp shine along the left side */}
            <ellipse cx="9" cy="27" rx="5" ry="17" fill="#fff" opacity=".42" filter={`url(#${id}g)`} />
            <ellipse cx="16.5" cy="22" rx="3" ry="10" fill="#fff" opacity=".18" filter={`url(#${id}g)`} />
            <path d="M5.6 13C3.6 22 3.4 35 5.8 46" stroke={`url(#${id}s)`} strokeWidth="3.2" strokeLinecap="round" fill="none" filter={`url(#${id}f)`} />
            {/* bright glint near the tip, and the faint light caught on the lower right rim */}
            <ellipse cx="16.8" cy="10" rx="2.2" ry="4.4" transform="rotate(22 16.8 10)" fill="#fff" opacity=".95" filter={`url(#${id}f)`} />
            <path d="M22.8 38C22.6 47 20.6 55 16.5 60" stroke="#fff" strokeOpacity=".3" strokeWidth="1.4" strokeLinecap="round" fill="none" filter={`url(#${id}f)`} />
          </g>
          <path d={nail} fill="none" stroke="#000" strokeOpacity=".1" strokeWidth=".8" />
        </g>
      ))}
    </svg>
  )
}

/** Pink satin bow for the corner of the colour chart. */
function Bow() {
  return (
    <svg className="cp-bow" viewBox="0 0 220 190" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cpBowA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe3ec" />
          <stop offset=".5" stopColor="#f6a9c0" />
          <stop offset="1" stopColor="#e07b9b" />
        </linearGradient>
        <linearGradient id="cpBowB" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe8ef" />
          <stop offset=".55" stopColor="#f3a2ba" />
          <stop offset="1" stopColor="#d96f91" />
        </linearGradient>
      </defs>
      {/* tails */}
      <path d="M100 92C88 120 70 150 44 178L66 170 74 186C94 158 106 128 112 98Z" fill="url(#cpBowB)" />
      <path d="M118 96C128 124 142 150 166 170L146 168 142 184C122 160 112 130 108 100Z" fill="url(#cpBowA)" />
      {/* loops */}
      <path d="M104 84C78 44 26 24 14 52 4 78 46 106 102 98Z" fill="url(#cpBowA)" />
      <path d="M100 90C72 70 38 58 30 64" stroke="#fff" strokeOpacity=".7" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M116 84C140 40 196 20 208 50 218 78 172 104 118 98Z" fill="url(#cpBowB)" />
      <path d="M122 88C150 66 184 54 194 60" stroke="#fff" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* knot */}
      <ellipse cx="110" cy="91" rx="15" ry="13" fill="url(#cpBowB)" />
      <ellipse cx="106" cy="86" rx="6" ry="4" fill="#fff" opacity=".7" />
    </svg>
  )
}

// Sorted: object keys like "10" come before "01" otherwise, which would scramble the chart.
const NUMBERS = Object.keys(SHADE_COLORS).sort()

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little']
const HAND_COLUMNS = [['left', 'Left hand'], ['right', 'Right hand']]
export const EMPTY_NAILS = { left: [null, null, null, null, null], right: [null, null, null, null, null] }

/** Whether any nail has its own colour, and whether all ten do. */
export const nailsStarted = (nails) => Boolean(nails && [...nails.left, ...nails.right].some(Boolean))
export const nailsComplete = (nails) => Boolean(nails && [...nails.left, ...nails.right].every(Boolean))

/** The next nail without a colour: the left hand first, then the right. */
function nextEmptyNail(nails) {
  for (const [hand] of HAND_COLUMNS) {
    const index = nails[hand].findIndex((c) => !c)
    if (index >= 0) return { hand, index }
  }
  return null
}

/**
 * "Colour for each nail" (optional), inside the chart window: tap a nail, then a shade on the chart. The next empty nail
 * is chosen for you, left hand first; the right hand opens once all five left nails have a colour. A colour can be used
 * on as many nails as the client likes.
 */
function NailSlots({ nails, target, onTarget, onClear, off = false }) {
  const leftDone = nails.left.every(Boolean)
  const targetLabel = target && `${target.hand} ${FINGERS[target.index].toLowerCase()}`
  return (
    <div className={off ? 'cp-nails is-off' : 'cp-nails'} role="group" aria-label="Colour for each nail">
      <div className="cp-nails-head">
        <h3>Colour for each nail <span className="pick-optional">(optional)</span></h3>
        {nailsStarted(nails) && !off && <button type="button" className="link-button" onClick={onClear}>Clear all</button>}
      </div>
      <p className="cp-nails-hint" aria-live="polite">
        {off ? 'Not needed: Leyah helps you choose at the salon.' : target ? `Now tap a shade for your ${targetLabel}.` : 'Tap a nail, then a shade. Left hand first.'}
      </p>
      {HAND_COLUMNS.map(([hand, label]) => {
        const locked = off || (hand === 'right' && !leftDone)
        return (
          <div key={hand} className={locked ? 'cp-hand is-locked' : 'cp-hand'} role="group" aria-label={label}>
            <span className="cp-hand-label">{label.split(' ')[0]}</span>
            <div className="cp-hand-nails">
              {FINGERS.map((finger, i) => {
                const c = nails[hand][i]
                const on = target?.hand === hand && target.index === i
                return (
                  <button key={finger} type="button" disabled={locked} aria-pressed={on} title={c ? `${finger}: ${colorLabel(c)}` : finger}
                    className={['cp-slot', c && 'chosen', on && 'on'].filter(Boolean).join(' ')} onClick={() => onTarget(on ? null : { hand, index: i })}
                    aria-label={`${label}, ${finger.toLowerCase()}: ${c ? `${colorLabel(c)}. Change colour` : 'choose a colour'}`}>
                    {c ? <NailPair color={colorFor(c)} className="cp-slot-nails" /> : <span className="cp-slot-empty" aria-hidden="true">+</span>}
                    <span className="cp-slot-name" aria-hidden="true">{finger}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The colour chart in a window: the 58 Conspiracy Theories swatches on the left, the chosen one large on the right,
 * and, when the booking allows it, a colour for each nail, the salon's other choices ("Not sure yet") and "Can't find
 * your colour?" with a box to describe it. Nothing changes until the button at the bottom; closing keeps the choice
 * made before.
 */
export function ColorPickerModal({ value, onChoose, onClose, nails: savedNails, onNails, others = [], request = null, onRequest, outOfStock = [] }) {
  const missing = (n) => outOfStock.includes(`#${n}`) // shades Leyah has run out of can't be picked
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })
  const [picked, setPicked] = useState(() => shadeNumber(value))
  const [shown, setShown] = useState(() => shadeNumber(value)) // the shade in the large preview: the last one tapped
  const [nails, setNails] = useState(savedNails ?? EMPTY_NAILS)
  const [target, setTarget] = useState(null) // the nail the next tapped shade goes on
  const [other, setOther] = useState(() => (others.includes(value) ? value : null)) // e.g. "Not sure yet (decide at the salon)"
  const [asking, setAsking] = useState(request !== null) // "Can't find your colour?"
  const [requestText, setRequestText] = useState(request ?? '')
  const started = Boolean(onNails) && nailsStarted(nails)
  const complete = nailsComplete(nails)

  // A shade, one of the salon's other choices, or a colour request: choosing one sets the others aside.
  const choose = ({ shade = null, otherChoice = null, ask = false }) => {
    setPicked(shade); setShown(shade); setOther(otherChoice); setAsking(ask)
    if (otherChoice) { setNails(EMPTY_NAILS); setTarget(null) }
  }
  const undecided = Boolean(other) // "Not sure yet": the colour is chosen at the salon, so the chart is switched off
  const tapShade = (n) => {
    setShown(n)
    if (!target) { choose({ shade: n }); return }
    const next = { ...nails, [target.hand]: nails[target.hand].map((c, i) => (i === target.index ? `#${n}` : c)) }
    setNails(next)
    setTarget(nextEmptyNail(next))
  }
  const checked = target ? shadeNumber(nails[target.hand][target.index]) : picked
  const use = () => {
    if (asking) onRequest?.(requestText.trim())
    else if (other) onChoose(other)
    else if (picked) onChoose(`#${picked}`)
    onNails?.(started ? nails : EMPTY_NAILS)
    onClose()
  }
  const hasChoice = Boolean(picked || other || asking || started || nailsStarted(savedNails))
  const blocked = !hasChoice || (asking && !requestText.trim()) || (started && !complete)
  const useLabel = asking ? 'Ask Leyah for This Colour' : started ? 'Use These Colours' : other ? 'Use This Choice' : 'Use This Color'

  useEffect(() => {
    const before = document.activeElement
    dialogRef.current?.querySelector('[aria-checked="true"]')?.focus() ?? dialogRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
      before?.focus?.()
    }
  }, [])

  const info = shown ? SHADE_NAMES[shown] : null

  return createPortal(
    <div className="modal-backdrop cp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cp" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <button type="button" className="cp-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <section className="cp-chart" aria-label={`${COLLECTION.name} colour chart`}>
          <Bow />
          <svg className="cp-arc" viewBox="0 0 400 70" aria-hidden="true">
            <path id="cpArc" d="M20 66Q200 -6 380 66" fill="none" />
            <text><textPath href="#cpArc" startOffset="50%" textAnchor="middle" textLength="330" lengthAdjust="spacingAndGlyphs">NAIL POLISH DISPLAY FULL SPECIAL PALETTE COLLECTION</textPath></text>
          </svg>
          <div className="cp-chart-head">
            <p className="cp-collection"><span>{COLLECTION.name.split(' ')[0]}</span>{COLLECTION.name.split(' ').slice(1).join(' ')}</p>
            <p className="cp-code"><strong>{COLLECTION.code}</strong>Swatches</p>
          </div>
          <div className={undecided ? 'cp-grid is-off' : 'cp-grid'} role="radiogroup" aria-label="Shades" aria-disabled={undecided || undefined}>
            {NUMBERS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={checked === n}
                aria-label={`Shade #${n}${SHADE_NAMES[n] ? `, ${SHADE_NAMES[n].name}` : ''}${missing(n) ? ', out of stock' : ''}`}
                title={missing(n) ? `${colorLabel(`#${n}`)} · out of stock` : colorLabel(`#${n}`)}
                className={['cp-swatch', checked === n && 'on', missing(n) && 'is-out'].filter(Boolean).join(' ')} onClick={() => tapShade(n)}
                disabled={undecided || missing(n)}>
                <NailPair color={SHADE_COLORS[n]} />
                <span className="cp-num">#{n}</span>
                {missing(n) && <span className="cp-out" aria-hidden="true">Out of stock</span>}
                {checked === n && (
                  <span className="cp-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg></span>
                )}
              </button>
            ))}
          </div>
          <p className="cp-foot" aria-hidden="true"><span>✦</span>Fashion display color<span>✦</span></p>
        </section>

        <section className="cp-side">
          <h2 id={titleId}>Choose Nail Color</h2>
          <p className="cp-intro">Select a color from the {COLLECTION.name} collection.</p>

          {/* One card for the shade: large nails, its number and name, and what it looks like. */}
          <div className={shown ? 'cp-pick' : 'cp-pick is-empty'} aria-live="polite">
            <h3 className="cp-pick-label">{shown && shown !== picked ? 'Shade for your nail' : 'Selected Color'}</h3>
            {shown ? (
              <div className="cp-pick-body">
                <NailPair color={SHADE_COLORS[shown]} className="cp-pick-nails" />
                <div className="cp-pick-text">
                  <div className="cp-pick-name"><span className="cp-pill">#{shown}</span><h4>{info?.name ?? `Shade ${shown}`}</h4></div>
                  <p className="cp-pick-desc">{info?.description ?? `From the ${COLLECTION.name} ${COLLECTION.code} chart. Leyah uses this exact bottle for your set.`}</p>
                </div>
                {shown === picked && (
                  <button type="button" className="cp-clear" onClick={() => { setPicked(null); setShown(null) }} aria-label={`Clear #${picked}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
                  </button>
                )}
              </div>
            ) : (
              // Every state without a shade has the same two lines, so the card keeps its height.
              <p className="cp-pick-empty">
                {other ?? (asking ? 'Colour request' : 'No color selected yet.')}
                <span className="cp-pick-sub">{other ? 'Tap it again to choose a shade instead.' : asking ? 'Describe the colour below.' : 'Tap a shade on the chart.'}</span>
              </p>
            )}
          </div>

          {onNails && (
            <NailSlots nails={nails} target={target} onTarget={setTarget} off={undecided}
              onClear={() => { setNails(EMPTY_NAILS); setTarget(null) }} />
          )}

          {(others.length > 0 || onRequest) && (
            <div className="cp-others">
              <div className="chips" role="radiogroup" aria-label="Other colour choices">
                {others.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={other === c} className={other === c ? 'chip color-chip selected' : 'chip color-chip'}
                    onClick={() => choose({ otherChoice: other === c ? null : c })}>{c}</button>
                ))}
                {onRequest && (
                  <button type="button" role="radio" aria-checked={asking} className={asking ? 'chip color-chip selected' : 'chip color-chip'}
                    onClick={() => choose({ ask: !asking })}>Can&apos;t find your colour?</button>
                )}
              </div>
              {asking && (
                <div className="cp-request">
                  <div className="pick-title-row">
                    <label htmlFor="color-request" className="field-label pick-title">Describe the colour you&apos;d like <span className="required" aria-hidden="true">*</span></label>
                    <span className="field-counter" aria-live="polite">{requestText.length}/{LIMITS.colorRequestMax}</span>
                  </div>
                  <textarea id="color-request" className="input textarea" rows={2} maxLength={LIMITS.colorRequestMax} value={requestText}
                    placeholder="e.g. A soft sage green, a little lighter than #21" onChange={(e) => setRequestText(e.target.value)} />
                  <p className="cp-request-hint">Leyah checks whether she has this shade and lets you know. Your booking shows &ldquo;Colour request: pending confirmation&rdquo; until she does.</p>
                </div>
              )}
            </div>
          )}

          {started && !complete && <p className="cp-use-note">Choose all 10 nails to use these colours, or Clear all.</p>}
          {asking && !requestText.trim() && <p className="cp-use-note">Describe the colour you&apos;re looking for.</p>}
          <button type="button" className="cp-use" onClick={use} disabled={blocked}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {useLabel}
          </button>
        </section>
      </div>
    </div>,
    document.body,
  )
}

/**
 * The "Choose a colour" part of the booking: the chosen shade (or a button to open the chart), plus any other
 * choices on the salon's list such as "Not sure yet (decide at the salon)".
 */
export function ColorChooser({ colors, value, onChange, request = null, onRequest, nails, onNails, outOfStock = [] }) {
  const [open, setOpen] = useState(false)
  const others = colors.filter((c) => !shadeNumber(c))
  const shade = shadeNumber(value)
  const eachNail = !shade && nailsComplete(nails)
  const asking = request !== null
  const otherChosen = !shade && !asking && others.includes(value)
  const chosen = Boolean(shade || eachNail || asking || otherChosen)
  const title = shade ? colorLabel(value) : asking ? 'Colour request' : otherChosen ? value : eachNail ? 'A colour for each nail' : 'Choose from 58 shades'
  const sub = shade || eachNail ? `${COLLECTION.name} ${COLLECTION.code}`
    : asking ? (request.trim() || 'Describe the colour in the chart')
      : otherChosen ? 'Leyah helps you choose at the salon' : `Open the ${COLLECTION.name} colour chart`
  return (
    <div className="cc">
      <button type="button" className={chosen ? 'cc-card chosen' : 'cc-card'} onClick={() => setOpen(true)}
        aria-label={shade ? `Colour ${title}. Change colour` : eachNail && !asking ? 'A colour for each nail. Change colours' : chosen ? `${title}. Change colour` : 'Open the colour chart'}>
        {shade ? <NailPair color={colorFor(value)} className="cc-nails" /> : <span className="cc-chart-icon" aria-hidden="true">{
          (eachNail ? [...nails.left, ...nails.right].slice(0, 5).map(shadeNumber) : ['06', '13', '22', '17', '51'])
            .map((n, i) => <span key={i} style={{ background: SHADE_COLORS[n] }} />)
        }</span>}
        <span className="cc-text">
          <strong>{title}</strong>
          <span>{sub}</span>
        </span>
        <span className="cc-action">{chosen ? 'Change' : 'Open chart'}</span>
      </button>
      {nailsComplete(nails) && <p className="cc-nails-text muted small">Each nail: {perNailText(nails)}</p>}
      {open && (
        <ColorPickerModal value={value} onChoose={onChange} onClose={() => setOpen(false)} nails={nails} onNails={onNails} outOfStock={outOfStock}
          others={others} request={request} onRequest={onRequest} />
      )}
    </div>
  )
}
