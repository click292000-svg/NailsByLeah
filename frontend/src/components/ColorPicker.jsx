import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLLECTION, SHADE_COLORS, SHADE_NAMES, colorFor, colorLabel, shadeNumber } from '../lib/shades'

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

/**
 * The colour chart in a window: the 58 Conspiracy Theories swatches on the left, the chosen one large on the right.
 * Nothing changes until "Use This Color"; closing keeps the colour chosen before.
 */
export function ColorPickerModal({ value, onChoose, onClose }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })
  const [picked, setPicked] = useState(() => shadeNumber(value))

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

  const info = picked ? SHADE_NAMES[picked] : null

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
          <div className="cp-grid" role="radiogroup" aria-label="Shades">
            {NUMBERS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={picked === n} aria-label={`Shade #${n}${SHADE_NAMES[n] ? `, ${SHADE_NAMES[n].name}` : ''}`}
                title={colorLabel(`#${n}`)} className={picked === n ? 'cp-swatch on' : 'cp-swatch'} onClick={() => setPicked(n)}>
                <NailPair color={SHADE_COLORS[n]} />
                <span className="cp-num">#{n}</span>
                {picked === n && (
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

          <div className="cp-preview" aria-live="polite">
            {picked ? (
              <>
                <NailPair color={SHADE_COLORS[picked]} className="cp-preview-nails" />
                <div className="cp-preview-text">
                  <span className="cp-pill">#{picked}</span>
                  <h3>{info?.name ?? `Shade ${picked}`}</h3>
                  <p>{info?.description ?? `From the ${COLLECTION.name} ${COLLECTION.code} chart. Leyah uses this exact bottle for your set.`}</p>
                </div>
              </>
            ) : (
              <p className="cp-preview-empty">Tap a shade on the chart to see it here.</p>
            )}
          </div>

          <div className="cp-selected">
            <h3>Selected Color</h3>
            {picked ? (
              <div className="cp-selected-row">
                <NailPair color={SHADE_COLORS[picked]} className="cp-selected-nails" />
                <span>{colorLabel(`#${picked}`)}{!info && <span className="cp-selected-sub"> · {COLLECTION.name}</span>}</span>
                <button type="button" className="cp-clear" onClick={() => setPicked(null)} aria-label={`Clear #${picked}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
                </button>
              </div>
            ) : <p className="cp-selected-none">No color selected yet.</p>}
          </div>

          <button type="button" className="cp-use" disabled={!picked} onClick={() => { onChoose(`#${picked}`); onClose() }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Use This Color
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
export function ColorChooser({ colors, value, onChange }) {
  const [open, setOpen] = useState(false)
  const others = colors.filter((c) => !shadeNumber(c))
  const shade = shadeNumber(value)
  return (
    <div className="cc">
      <button type="button" className={shade ? 'cc-card chosen' : 'cc-card'} onClick={() => setOpen(true)}
        aria-label={shade ? `Colour ${colorLabel(value)}. Change colour` : 'Open the colour chart'}>
        {shade ? <NailPair color={colorFor(value)} className="cc-nails" /> : <span className="cc-chart-icon" aria-hidden="true">{
          ['06', '13', '22', '17', '51'].map((n) => <span key={n} style={{ background: SHADE_COLORS[n] }} />)
        }</span>}
        <span className="cc-text">
          <strong>{shade ? colorLabel(value) : 'Choose from 58 shades'}</strong>
          <span>{shade ? `${COLLECTION.name} ${COLLECTION.code}` : `Open the ${COLLECTION.name} colour chart`}</span>
        </span>
        <span className="cc-action">{shade ? 'Change' : 'Open chart'}</span>
      </button>
      {others.length > 0 && (
        <div className="chips" role="radiogroup" aria-label="Other colour choices">
          {others.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={value === c} className={value === c ? 'chip color-chip selected' : 'chip color-chip'}
              onClick={() => onChange(c)}>{c}</button>
          ))}
        </div>
      )}
      {open && <ColorPickerModal value={value} onChoose={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}
