import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Alert, PageLoader } from '../../../components/ui'
import { errorMessage } from '../../../api/errors'
import { canAnimate, peso, prefersReducedMotion } from './motion'

const lowest = (items) => (items.length ? Math.min(...items.map((i) => i.price)) : null)

/** Starting prices from the live price list: Soft Gel, Removal and per-nail add-ons. */
function startingPrices({ services, addOns }) {
  const active = (items) => items.filter((i) => i.isActive !== false)
  const softGel = active(services.filter((s) => s.category === 'SoftGel'))
  const removal = active(services.filter((s) => s.category === 'Removal'))
  const extras = active(addOns)
  return [
    { title: 'Soft Gel', from: 'Starting at', price: lowest(softGel), tags: softGel.map((s) => s.name), dir: 'from-left' },
    { title: 'Removal', from: 'Starting at', price: lowest(removal), tags: removal.map((s) => s.name), dir: 'from-top' },
    { title: 'Add-ons', from: 'Per nail', price: lowest(extras), tags: extras.map((a) => a.name), dir: 'from-right' },
  ].filter((c) => c.price !== null)
}

/** Pricing: three cards fly in (left, top, right); "View full price list" unfolds Leyah's price card. */
export function PricingSection({ catalog, bookTo, onOpenPhoto }) {
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
            <figure>
              <button type="button" aria-label="Open Leyah's price card full size"
                onClick={(e) => onOpenPhoto({ src: '/img/price-list.jpg', alt: PRICE_CARD_ALT }, e.currentTarget)}>
                <img src="/img/price-list.jpg" width="941" height="1672" loading="lazy" alt={PRICE_CARD_ALT} />
              </button>
              <figcaption>Tap Leyah&apos;s price card to open it full size.</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}

const PRICE_CARD_ALT = "Leyah's price card: soft gel, removal and per-nail add-on prices."
