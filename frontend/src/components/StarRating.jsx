import { useState } from 'react'

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z'
const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

function Star({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={filled ? 'star filled' : 'star'}>
      <path d={STAR_PATH} />
    </svg>
  )
}

/**
 * Five stars to pick a rating. They are real radio buttons (arrow keys move between them), drawn as stars that
 * light up to the one hovered or chosen.
 */
export function StarRating({ value, onChange, error, disabled }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <fieldset className={error ? 'star-rating field-invalid' : 'star-rating'} disabled={disabled}>
      <legend className="field-label">Your rating <span className="required" aria-hidden="true">*</span></legend>
      <div className="star-row" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="star-option" onMouseEnter={() => setHover(n)}>
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only"
              aria-label={`${n} star${n === 1 ? '' : 's'} (${WORDS[n]})`} />
            <Star filled={n <= shown} />
          </label>
        ))}
        <span className="star-word" aria-hidden="true">{WORDS[shown] ?? ''}</span>
      </div>
      {error && <div className="field-error">{error}</div>}
    </fieldset>
  )
}

/** A rating shown as stars (read-only). */
export function Stars({ rating, size = 'md' }) {
  return (
    <span className={`stars stars-${size}`} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} filled={n <= Math.round(rating)} />)}
    </span>
  )
}
