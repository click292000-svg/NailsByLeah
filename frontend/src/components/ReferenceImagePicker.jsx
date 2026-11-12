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
 * `compact` shows a small button (and a thumbnail once added) instead of the large row of places, for a single extra
 * photo; `optional={false}` leaves out "(optional)" when the section heading already says it.
 */
export function ReferenceImagePicker({ images, onChange, max = LIMITS.referenceImagesPerBooking, title = 'Design reference photos',
  hint = 'Show Leyah the look you want · JPG, PNG or WebP · Large photos are shrunk for you', photoName = 'design reference',
  compact = false, optional = true }) {
  const inputId = useId()
  const [uploading, setUploading] = useState([]) // { key, name, previewUrl }
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [viewing, setViewing] = useState(null) // the photo shown full size
  const slotsLeft = max - images.length - uploading.length

  const addFiles = async (fileList) => {
    setError(null)
    const files = [...fileList]
    if (files.length > slotsLeft) setError(max === 1 ? 'Add one photo.' : REFERENCE_IMAGE_MESSAGES.tooMany)
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

  const fileInput = (
    <input id={inputId} className="sr-only" type="file" accept={REFERENCE_IMAGE_ACCEPT} multiple={max > 1}
      aria-labelledby={`${inputId}-label`} aria-describedby={error ? `${inputId}-error` : undefined}
      onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
  )
  const errorLine = error && <div id={`${inputId}-error`} className="field-error reference-error" role="alert">{error}</div>
  const viewer = viewing !== null && images[viewing] && (
    <Modal title={`${photoName[0].toUpperCase()}${photoName.slice(1)} ${viewing + 1} of ${images.length}`} onClose={() => setViewing(null)} wide
      footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
      <img className="reference-full" src={referenceImageUrl(images[viewing])} alt={`${photoName[0].toUpperCase()}${photoName.slice(1)} ${viewing + 1}, full size`} />
    </Modal>
  )

  if (compact) {
    return (
      <div className="reference-picker reference-compact">
        <ul className="reference-compact-list" aria-label={`Your ${title.toLowerCase()}`}>
          {images.map((image, i) => (
            <li key={image.id} className="reference-compact-tile">
              <button type="button" className="reference-view" onClick={() => setViewing(i)} aria-label={`View ${photoName} ${i + 1} full size`}>
                <img src={referenceImageUrl(image)} alt={`${photoName[0].toUpperCase()}${photoName.slice(1)} ${i + 1}${image.name ? ` (${image.name})` : ''}`} />
              </button>
              <button type="button" className="reference-remove" onClick={() => remove(image)} disabled={removing === image.id}
                aria-label={`Remove ${photoName} ${i + 1}`}>×</button>
            </li>
          ))}
          {uploading.map((u) => (
            <li key={u.key} className="reference-compact-tile is-uploading">
              <img src={u.previewUrl} alt={`Uploading ${u.name}`} />
              <span className="reference-progress"><Spinner small label={`Uploading ${u.name}`} /></span>
            </li>
          ))}
        </ul>
        {slotsLeft > 0 && (
          <label htmlFor={inputId} className="reference-compact-add">
            <span aria-hidden="true">+</span>
            <span id={`${inputId}-label`}>{title}</span>
            {optional && <span className="pick-optional">(optional)</span>}
          </label>
        )}
        {slotsLeft <= 0 && <span id={`${inputId}-label`} className="muted small">{title}</span>}
        <span className="muted small reference-compact-hint">{hint}</span>
        {fileInput}
        {errorLine}
        {viewer}
      </div>
    )
  }

  return (
    <div className="pick-column reference-picker">
      <div className="pick-title-row">
        <span className="field-label pick-title" id={`${inputId}-label`}>{title}{optional && <> <span className="pick-optional">(optional)</span></>}</span>
        <span className="field-counter">{images.length + uploading.length}/{max}</span>
      </div>
      <div className="pick-card">
      <ul className="reference-grid" aria-label={`Your ${title.toLowerCase()}`}>
        {images.map((image, i) => (
          <li key={image.id} className="reference-tile">
            <button type="button" className="reference-view" onClick={() => setViewing(i)} aria-label={`View ${photoName} ${i + 1} full size`}>
              <img src={referenceImageUrl(image)} alt={`${photoName[0].toUpperCase()}${photoName.slice(1)} ${i + 1}${image.name ? ` (${image.name})` : ''}`} />
            </button>
            <button type="button" className="reference-remove" onClick={() => remove(image)} disabled={removing === image.id}
              aria-label={`Remove ${photoName} ${i + 1}`}>×</button>
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
      {fileInput}
      {errorLine}
      <p className="pick-hint">{hint}</p>
      </div>
      {viewer}
    </div>
  )
}
