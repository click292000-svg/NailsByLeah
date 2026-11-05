import { useId, useState } from 'react'
import { api, referenceImageUrl } from '../api'
import { errorMessage } from '../api/errors'
import { LIMITS, REFERENCE_IMAGE_ACCEPT, REFERENCE_IMAGE_MESSAGES, validateReferenceImage } from '../validation/rules'
import { shrinkImage } from '../lib/shrinkImage'
import { Modal } from './Modal'
import { Button, Spinner } from './ui'

/**
 * Upload up to 3 photos of the nail design the client wants. Each photo is checked (JPG/PNG/WebP), shrunk if it is
 * large, previewed straight away, and uploaded to private storage. `images` are the uploaded photos; they are
 * attached to the booking when it is paid for, and kept in the booking draft until then.
 */
export function ReferenceImagePicker({ images, onChange }) {
  const inputId = useId()
  const [uploading, setUploading] = useState([]) // { key, name, previewUrl }
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [viewing, setViewing] = useState(null) // the photo shown full size
  const slotsLeft = LIMITS.referenceImagesPerBooking - images.length - uploading.length

  const addFiles = async (fileList) => {
    setError(null)
    const files = [...fileList]
    if (files.length > slotsLeft) setError(REFERENCE_IMAGE_MESSAGES.tooMany)
    for (const file of files.slice(0, Math.max(0, slotsLeft))) {
      // Size is checked after shrinking: a large phone photo usually ends up well under the limit.
      const problem = validateReferenceImage(file)
      if (problem && problem !== REFERENCE_IMAGE_MESSAGES.size) {
        setError(`${file.name}: ${problem}`)
        continue
      }
      const pending = { key: `${file.name}-${Date.now()}-${Math.random()}`, name: file.name, previewUrl: URL.createObjectURL(file) }
      setUploading((current) => [...current, pending])
      try {
        const ready = await shrinkImage(file)
        const stillTooBig = validateReferenceImage(ready)
        if (stillTooBig) {
          setError(`${file.name}: ${stillTooBig}`)
          continue
        }
        const uploaded = await api.referenceImages.upload(ready)
        onChange((current) => [...current, { ...uploaded, name: file.name }])
      } catch (err) {
        setError(`${file.name}: ${err.fieldError?.('file') ?? errorMessage(err)}`)
      } finally {
        setUploading((current) => current.filter((u) => u.key !== pending.key))
        URL.revokeObjectURL(pending.previewUrl) // the local preview is replaced by the uploaded photo
      }
    }
  }

  const remove = async (image) => {
    setRemoving(image.id)
    setError(null)
    try {
      await api.referenceImages.remove(image.id)
    } catch (err) {
      // Already gone on the server (e.g. removed in another tab): just drop it here too.
      if (err.status !== 404) {
        setError(errorMessage(err))
        setRemoving(null)
        return
      }
    }
    onChange((current) => current.filter((i) => i.id !== image.id))
    setRemoving(null)
  }

  return (
    <div className="pick-column reference-picker">
      <div className="pick-title-row">
        <span className="field-label pick-title" id={`${inputId}-label`}>Design reference photos <span className="pick-optional">(optional)</span></span>
        <span className="field-counter">{images.length + uploading.length}/{LIMITS.referenceImagesPerBooking}</span>
      </div>
      <div className="pick-card">
      <ul className="reference-grid" aria-label="Your reference photos">
        {images.map((image, i) => (
          <li key={image.id} className="reference-tile">
            <button type="button" className="reference-view" onClick={() => setViewing(i)} aria-label={`View design reference ${i + 1} full size`}>
              <img src={referenceImageUrl(image)} alt={`Design reference ${i + 1}${image.name ? ` (${image.name})` : ''}`} />
            </button>
            <button type="button" className="reference-remove" onClick={() => remove(image)} disabled={removing === image.id}
              aria-label={`Remove design reference ${i + 1}`}>×</button>
          </li>
        ))}
        {uploading.map((u) => (
          <li key={u.key} className="reference-tile is-uploading">
            <img src={u.previewUrl} alt={`Uploading ${u.name}`} />
            <span className="reference-progress"><Spinner small label={`Uploading ${u.name}`} /> Uploading…</span>
          </li>
        ))}
        {slotsLeft > 0 && (
          <li>
            <label htmlFor={inputId} className={dragging ? 'reference-drop dragging' : 'reference-drop'}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}>
              <span className="reference-plus" aria-hidden="true">+</span>
              <span>Add photo</span>
            </label>
          </li>
        )}
        {/* The unused places stay marked, so the row keeps its shape and shows how many more can be added. */}
        {Array.from({ length: Math.max(0, slotsLeft - 1) }, (_, i) => <li key={i} className="reference-empty" aria-hidden="true" />)}
      </ul>
      <input id={inputId} className="sr-only" type="file" accept={REFERENCE_IMAGE_ACCEPT} multiple
        aria-labelledby={`${inputId}-label`} aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      {error && <div id={`${inputId}-error`} className="field-error reference-error" role="alert">{error}</div>}
      <p className="pick-hint">Show Leyah the look you want · JPG, PNG or WebP · Large photos are shrunk for you</p>
      </div>
      {viewing !== null && images[viewing] && (
        <Modal title={`Design reference ${viewing + 1} of ${images.length}`} onClose={() => setViewing(null)} wide
          footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
          <img className="reference-full" src={referenceImageUrl(images[viewing])} alt={`Design reference ${viewing + 1}, full size`} />
        </Modal>
      )}
    </div>
  )
}
