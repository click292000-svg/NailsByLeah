import { useId, useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, fieldErrors } from '../../api/errors'
import { config } from '../../config'
import { LIMITS, REFERENCE_IMAGE_ACCEPT, validateReferenceImage } from '../../validation/rules'
import { shrinkImage } from '../../lib/shrinkImage'
import { Alert, Button, Card, EmptyState, PageHeader, PageLoader, TextField } from '../../components/ui'

/** Where an uploaded gallery photo is served: the API's address, or the test backend's data URL. */
export const galleryPhotoSrc = (photo) =>
  photo.dataUrl ?? (/^https?:/.test(photo.url) ? photo.url : `${config.apiBaseUrl.replace(/\/$/, '')}${photo.url.replace(/^\/api/, '')}`)

/**
 * Leyah's photos for the home page's Our Works gallery. New photos show first; until she adds any, the home page keeps
 * its built-in photos.
 */
export default function GalleryPage() {
  const photos = useAsync(() => api.admin.gallery(), [])
  const [message, setMessage] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [error, setError] = useState(null)

  if (photos.loading && !photos.data) return <PageLoader label="Loading photos…" />
  if (photos.error) return <Alert kind="error">{errorMessage(photos.error)}</Alert>

  const remove = async (photo) => {
    if (!window.confirm('Remove this photo from the home page?')) return
    setRemoving(photo.id)
    setError(null)
    try {
      await api.admin.removeGalleryPhoto(photo.id)
      photos.setData((list) => list.filter((p) => p.id !== photo.id))
      setMessage('Photo removed.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader title="Gallery" subtitle="Photos of your work for the home page's Our Works section. The newest shows first." />
      {message && <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <AddPhoto onAdded={(photo) => { photos.setData((list) => [photo, ...list]); setMessage('Photo added to the home page.') }} />
      <Card title={`Your photos (${photos.data.length})`}>
        {photos.data.length === 0 ? (
          <EmptyState title="No photos yet">Until you add some, the home page shows its own sample photos.</EmptyState>
        ) : (
          <ul className="gallery-admin">
            {photos.data.map((p) => (
              <li key={p.id}>
                <img src={galleryPhotoSrc(p)} alt={p.caption ?? 'Gallery photo'} loading="lazy" />
                <div className="gallery-admin-foot">
                  <span>{p.caption ?? <span className="muted">No caption</span>}</span>
                  <Button variant="danger-ghost" size="sm" loading={removing === p.id} onClick={() => remove(p)}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function AddPhoto({ onAdded }) {
  const inputId = useId()
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const pick = (chosen) => {
    setErrors({})
    const problem = chosen && validateReferenceImage(chosen)
    setFile(problem && !/large|size/i.test(problem) ? null : chosen)
    if (problem && !/large|size/i.test(problem)) setErrors({ file: problem })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!file) { setErrors({ file: 'Choose a photo.' }); return }
    setSaving(true)
    try {
      const ready = await shrinkImage(file)
      onAdded(await api.admin.addGalleryPhoto(ready, caption.trim() || null))
      setFile(null)
      setCaption('')
      e.target.reset()
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: Object.keys(fieldErrors(err)).length ? null : errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Add a photo">
      <form className="gallery-add" onSubmit={submit} noValidate>
        {errors.form && <Alert kind="error">{errors.form}</Alert>}
        <div className="field">
          <label htmlFor={inputId} className="field-label">Photo</label>
          <input id={inputId} className="input" type="file" accept={REFERENCE_IMAGE_ACCEPT} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {errors.file && <div className="field-error">{errors.file}</div>}
          <p className="muted small">JPG, PNG or WebP. Large photos are shrunk for you.</p>
        </div>
        <TextField label="Caption (optional)" maxLength={LIMITS.galleryCaptionMax} value={caption} error={errors.caption}
          placeholder="e.g. Lace with silver studs" onChange={(e) => setCaption(e.target.value)} />
        <div><Button type="submit" loading={saving}>Add to the home page</Button></div>
      </form>
    </Card>
  )
}
