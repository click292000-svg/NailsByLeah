import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Alert, PageLoader } from '../../../components/ui'
import { errorMessage } from '../../../api/errors'
import { canAnimate, peso, prefersReducedMotion } from './motion'
import { softGelSets, withDesignName } from '../../../lib/services'

const lowest = (items) => (items.length ? Math.min(...items.map((i) => i.price)) : null)

/** Starting prices from the live price list: Soft Gel, Removal and per-nail add-ons. */
function startingPrices({ services, addOns }) {
  const active = (items) => items.filter((i) => i.isActive !== false)
  const softGel = active(services.filter((s) => s.category === 'SoftGel'))
  const removal = active(services.filter((s) => s.category === 'Removal'))
  const extras = active(addOns)
  const sets = softGelSets(softGel)
  return [
    // The sets as clients book them: Plain, Soft Gel Extension, BIAB, then "With design" as the option on top.
    { title: 'Soft Gel', from: 'Starting at', price: lowest(softGel), dir: 'from-left',
      tags: [...sets.map((s) => s.base.name), ...(sets.some((s) => s.design) ? ['With design (optional)'] : [])] },
    { title: 'Removal', from: 'Starting at', price: lowest(removal), tags: removal.map((s) => s.name), dir: 'from-top' },
    { title: 'Add-ons', from: 'Per nail', price: lowest(extras), tags: extras.map((a) => a.name), dir: 'from-right' },
  ].filter((c) => c.price !== null)
}

/** Pricing: three cards fly in (left, top, right); "View full price list" unfolds the full price card. */
export function PricingSection({ catalog, bookTo }) {
  const cardsRef = useRef(null)
  const listRef = useRef(null)
  const [cardsIn, setCardsIn] = useState(!canAnimate)
  const [listOpen, setListOpen] = useState(false)
  const loaded = Boolean(catalog.data)

  useEffect(() => {
    if (cardsIn || !loaded) return undefined
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setCardsIn(true) }, { threshold: 0.25 })
    io.observe(cardsRef.current)
    return () => io.disconnect()
  }, [cardsIn, loaded])

  const toggleList = () => {
    setListOpen((open) => !open)
    if (!listOpen) setTimeout(() => listRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' }), 350)
  }

  return (
    <section className="hm-prices hm-section" id="prices" tabIndex={-1} aria-labelledby="prices-title">
      <div className="hm-head">
        <h2 id="prices-title">Pricing</h2>
        <p>Starting prices are shown below. The final price depends on the service, design and add-ons.</p>
      </div>
      {catalog.loading && <PageLoader label="Loading prices…" />}
      {catalog.error && <Alert kind="error">{errorMessage(catalog.error)}</Alert>}
      {loaded && (
        <div className={cardsIn ? 'hm-cards is-in' : 'hm-cards'} ref={cardsRef}>
          {startingPrices(catalog.data).map((c) => (
            <div key={c.title} className={`hm-card ${c.dir}`}>
              <h3>{c.title}</h3>
              <p className="hm-from">{c.from}</p>
              <div className="hm-amount">{peso(c.price)}+</div>
              <p className="hm-tags">{c.tags.join(' • ')}</p>
            </div>
          ))}
        </div>
      )}
      <div className="hm-price-actions">
        <button type="button" className="btn btn-secondary" aria-expanded={listOpen} aria-controls="full-price-list" onClick={toggleList}>
          {listOpen ? 'Hide price list' : 'View full price list'}
        </button>
        <Link to={bookTo} className="btn btn-primary">Book now</Link>
      </div>
      <div className={listOpen ? 'hm-unfold open' : 'hm-unfold'} id="full-price-list" aria-hidden={!listOpen} inert={!listOpen}>
        <div>
          <div className="hm-full-list" ref={listRef}>
            {loaded && <PriceCard catalog={catalog.data} />}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Leyah's full price list, drawn from the live prices so it always matches the booking page: the sets, their design
 * versions, removal and the per-nail add-ons. Styled after her printed price card.
 */
function PriceCard({ catalog }) {
  const active = (items) => items.filter((i) => i.isActive !== false)
  const sets = softGelSets(active(catalog.services))
  const designs = sets.filter((s) => s.design)
  const groups = [
    { title: 'Soft gel', rows: sets.map((s) => [s.base.name, s.base.price]) },
    { title: 'With design', note: 'optional', rows: designs.map((s) => [withDesignName(s.base), s.design.price]) },
    { title: 'Removal', rows: active(catalog.services.filter((s) => s.category === 'Removal')).map((s) => [s.name, s.price]) },
    { title: 'Add-ons', note: 'per nail', rows: active(catalog.addOns).map((a) => [a.name, a.price]) },
  ].filter((g) => g.rows.length)
  return (
    <article className="pc" aria-labelledby="pc-title">
      <img className="pc-logo" src="/img/logo.webp" width="1000" height="455" alt="Nails by Leyah" />
      <h3 className="pc-title" id="pc-title">Nails price list</h3>
      {groups.map((g) => (
        <section key={g.title} className="pc-group" aria-label={g.title}>
          <h4 className="pc-pill">{g.title}{g.note && <small> ({g.note})</small>}</h4>
          <dl>
            {g.rows.map(([name, price]) => (
              <div key={name} className="pc-row"><dt>{name}</dt><span className="pc-dots" aria-hidden="true" /><dd>{peso(price)}</dd></div>
            ))}
          </dl>
        </section>
      ))}
      <p className="pc-foot" aria-hidden="true">♡</p>
    </article>
  )
}
