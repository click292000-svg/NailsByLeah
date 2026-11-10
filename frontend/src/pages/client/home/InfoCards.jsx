import { salon } from '../../../content/salon'
import { config } from '../../../config'
import { formatPhone, useSalon } from '../../../components/SalonProfile'

const PinIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M21.6 12.23c0-.7-.06-1.37-.18-2.02H12v3.82h5.4a4.62 4.62 0 0 1-2 3.03v2.52h3.24c1.9-1.75 2.96-4.32 2.96-7.35zM12 22c2.7 0 4.97-.9 6.63-2.42l-3.24-2.52c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.6A10 10 0 0 0 12 22zm-5.6-8.1a6 6 0 0 1 0-3.8V7.5H3.06a10 10 0 0 0 0 9zM12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.5l3.34 2.6C7.19 7.74 9.4 5.98 12 5.98z" />
  </svg>
)

/**
 * "Visit us": address, opening hours and an "Open in Maps" button beside a live Google Map with the
 * salon's pin (Ref 2.1). Laid out side by side on wide screens, map below the text on phones.
 */
/** `hours` is the opening-hours line, e.g. "Open daily, 11:00 AM – 9:00 PM". */
const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />
  </svg>
)

/** Leyah's photo and bio from her profile; nothing is shown until she adds at least one of them. */
function MeetLeyah({ photo, bio }) {
  if (!photo && !bio) return null
  return (
    <div className="visit-meet">
      {photo && <img className="visit-meet-photo" src={photo} alt="Leyah" width="72" height="72" />}
      <div>
        <p className="visit-meet-name">Meet Leyah</p>
        {bio && <p className="visit-meet-bio">{bio}</p>}
      </div>
    </div>
  )
}

export function Location({ hours }) {
  const { phone, photo, bio } = useSalon()
  // The pin comes from the address search, centred on the salon's coordinates.
  const query = encodeURIComponent(salon.mapQuery)
  const center = `${salon.latitude},${salon.longitude}`
  // With an API key (VITE_GOOGLE_MAPS_API_KEY) the official Embed API is used; otherwise the keyless embed.
  const mapSrc = config.googleMapsApiKey
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(config.googleMapsApiKey)}&q=${query}&center=${center}&zoom=16`
    : `https://maps.google.com/maps?q=${query}&ll=${center}&z=16&output=embed`
  const openInMaps = `https://www.google.com/maps/search/?api=1&query=${query}`

  return (
    <div className="visit-card">
      <div className="visit-copy">
        <p className="visit-eyebrow">Visit us</p>
        <h2 id="find-us-title">Find Nails by Leyah</h2>
        <p className="visit-lead">Plan your design and book your appointment online, then visit Nails by Leyah.</p>
        <MeetLeyah photo={photo} bio={bio} />
        <address className="visit-facts">
          <span className="visit-pill"><PinIcon /> {salon.addressLines.join(', ')}</span>
          <span className="visit-pill"><ClockIcon /> {hours}</span>
          {phone && <a className="visit-pill visit-phone" href={`tel:${phone}`}><PhoneIcon /> {formatPhone(phone)}</a>}
        </address>
        <a className="visit-maps" href={openInMaps} target="_blank" rel="noopener noreferrer">
          <GoogleIcon /> Open in Maps
        </a>
      </div>
      <div className="visit-map">
        {/* Not loading="lazy": the browser's lazy trigger never fired on the home page, which left the map blank. */}
        <iframe title={`Map showing ${salon.name}`} src={mapSrc} referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      </div>
    </div>
  )
}
