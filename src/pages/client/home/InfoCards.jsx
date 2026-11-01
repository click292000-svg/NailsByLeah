import { Alert, Card, Money, PageLoader } from '../../../components/ui'
import { errorMessage } from '../../../api/errors'
import { salon } from '../../../mock/data/salon'
import { config } from '../../../config'

/** Every service with its base price in PHP, from the backend price list (Ref 2.2). `catalog` is a useAsync result. */
export function PriceList({ catalog }) {
  if (catalog.loading) return <Card title="Services & prices"><PageLoader label="Loading prices…" /></Card>
  if (catalog.error) return <Card title="Services & prices"><Alert kind="error">{errorMessage(catalog.error)}</Alert></Card>

  const { services, addOns, depositAmount } = catalog.data
  const groups = [
    ['Soft Gel', services.filter((s) => s.category === 'SoftGel')],
    ['Removal', services.filter((s) => s.category === 'Removal')],
    ['Stone (Add-on, per nail)', addOns],
  ]
  return (
    <Card title="Services & prices">
      {groups.map(([title, items]) => items.length > 0 && (
        <div key={title} className="price-group">
          <h3>{title}</h3>
          <ul className="price-list">
            {items.map((item) => (
              <li key={`${item.category}-${item.id}`}>
                <span>{item.name}</span>
                <span className="price-dots" aria-hidden="true" />
                <Money amount={item.price} />{item.pricingUnit === 'per nail' && <span className="muted"> / nail</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="deposit-note">
        Booking deposit: <strong><Money amount={depositAmount} /></strong> (fixed, non-refundable). It is deducted from your total.
      </p>
    </Card>
  )
}

/** Google Maps pin, full address and a working "Get Directions" link (Ref 2.1). */
export function Location() {
  const place = `${salon.latitude},${salon.longitude}`
  // With an API key (VITE_GOOGLE_MAPS_API_KEY) the official Embed API is used; otherwise the keyless embed.
  const mapSrc = config.googleMapsApiKey
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(config.googleMapsApiKey)}&q=${place}&zoom=17`
    : `https://maps.google.com/maps?q=${place}&z=17&output=embed`
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place}`

  return (
    <Card title="Find us">
      <div className="map-frame">
        <iframe title={`Map showing ${salon.name}`} src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      </div>
      <address className="address">
        <strong>{salon.name}</strong>
        {salon.addressLines.map((line) => <span key={line}>{line}</span>)}
        <span>{salon.hours}</span>
      </address>
      <a className="btn btn-secondary" href={directions} target="_blank" rel="noopener noreferrer">Get Directions</a>
    </Card>
  )
}
