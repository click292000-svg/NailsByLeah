import { useId, useState } from 'react'
import { api, referenceImageUrl } from '../api'
import { errorMessage } from '../api/errors'
import { LIMITS, REFERENCE_IMAGE_ACCEPT, REFERENCE_IMAGE_MESSAGES, validateReferenceImage } from '../validation/rules'
import { shrinkImage } from '../lib/shrinkImage'
import { Spinner } from './ui'

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
    <div className="reference-picker">
      <div className="field-top">
        <span className="field-label" id={`${inputId}-label`}>Design reference photos <span className="muted">(optional)</span></span>
        <span className="field-counter">{images.length + uploading.length}/{LIMITS.referenceImagesPerBooking}</span>
      </div>
      <p className="field-hint">Show Leyah the look you want. JPG, PNG or WebP. Large photos are shrunk for you.</p>

      <ul className="reference-grid" aria-label="Your reference photos">
        {images.map((image, i) => (
          <li key={image.id} className="reference-tile">
            <img src={referenceImageUrl(image)} alt={`Design reference ${i + 1}${image.name ? ` (${image.name})` : ''}`} />
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
      </ul>
      <input id={inputId} className="sr-only" type="file" accept={REFERENCE_IMAGE_ACCEPT} multiple
        aria-labelledby={`${inputId}-label`} aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      {error && <div id={`${inputId}-error`} className="field-error" role="alert">{error}</div>}
    </div>
  )
}
