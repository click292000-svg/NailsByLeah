import { useState } from 'react'
import { referenceImageUrl } from '../api'
import { Modal } from './Modal'
import { Button } from './ui'

/** A booking's design reference photos as thumbnails; tapping one shows it full size. */
export function ReferenceImageGallery({ images, label = 'Design reference photos' }) {
  const [open, setOpen] = useState(null)
  if (!images?.length) return null
  return (
    <>
      <ul className="reference-thumbs" aria-label={label}>
        {images.map((image, i) => (
          <li key={image.id}>
            <button type="button" className="reference-thumb-button" onClick={() => setOpen(i)} aria-label={`View design reference ${i + 1} full size`}>
              <img src={referenceImageUrl(image)} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Modal title={`Design reference ${open + 1} of ${images.length}`} onClose={() => setOpen(null)} wide
          footer={(
            <>
              {images.length > 1 && <Button variant="secondary" onClick={() => setOpen((open + images.length - 1) % images.length)}>Previous</Button>}
              {images.length > 1 && <Button variant="secondary" onClick={() => setOpen((open + 1) % images.length)}>Next</Button>}
              <Button onClick={() => setOpen(null)}>Close</Button>
            </>
          )}>
          <img className="reference-full" src={referenceImageUrl(images[open])} alt={`Design reference ${open + 1}`} />
        </Modal>
      )}
    </>
  )
}
