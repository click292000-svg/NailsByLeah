import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, fieldErrors } from '../../api/errors'
import { formatDate } from '../../lib/format'
import { toIsoDate } from '../../lib/dates'
import { hasErrors, LIMITS, validateFeedback } from '../../validation/rules'
import { Alert, Button, Card, Field, PageHeader } from '../../components/ui'
import { StarRating, Stars } from '../../components/StarRating'

/** Clients rate their experience: a 1-5 star rating is required, the comment is optional. */
export default function FeedbackPage() {
  const mine = useAsync(() => api.feedback.mine(), [])
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  // A new key per form: repeated clicks on Submit are saved once (the server returns the first result).
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID())
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [thanks, setThanks] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const found = validateFeedback({ rating, comment })
    setErrors(found)
    setFailure(null)
    if (hasErrors(found)) return
    setSubmitting(true)
    try {
      setThanks(await api.feedback.submit({ rating, comment: comment.trim() || null, submissionKey }))
      mine.reload()
    } catch (err) {
      setErrors(fieldErrors(err))
      if (!Object.keys(fieldErrors(err)).length) setFailure(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const again = () => {
    setRating(0)
    setComment('')
    setSubmissionKey(crypto.randomUUID())
    setThanks(null)
  }

  return (
    <div className="narrow stack">
      <PageHeader title="Rate your experience" subtitle="Tell Leyah how your nails turned out. It only takes a moment." />
      <Card>
        {thanks ? (
          <div className="stack feedback-thanks">
            <Alert kind="success" title="Thank you for your feedback!">Your {thanks.rating}-star rating has been sent to Leyah.</Alert>
            <Stars rating={thanks.rating} size="lg" />
            <div className="row">
              <Link to="/bookings" className="btn btn-primary">My bookings</Link>
              <Button variant="ghost" onClick={again}>Rate another visit</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="stack">
            {failure && <Alert kind="error">{failure}</Alert>}
            <StarRating value={rating} onChange={(n) => { setRating(n); setErrors((x) => ({ ...x, rating: undefined })) }}
              error={errors.rating} disabled={submitting} />
            <Field label="Comments or suggestions (optional)" error={errors.comment} counter={`${comment.length}/${LIMITS.feedbackCommentMax}`}>
              {(aria) => (
                <textarea className="input textarea" rows={3} maxLength={LIMITS.feedbackCommentMax} value={comment}
                  placeholder="What did you love? Anything we could do better?" onChange={(e) => setComment(e.target.value)} {...aria} />
              )}
            </Field>
            <Button type="submit" loading={submitting} disabled={submitting} className="feedback-submit">Submit feedback</Button>
          </form>
        )}
      </Card>

      {mine.data?.length > 0 && (
        <Card title="Your past feedback">
          <ul className="feedback-list">
            {mine.data.map((f) => (
              <li key={f.id}>
                <div className="feedback-meta"><Stars rating={f.rating} size="sm" /> <span className="muted small">{formatDate(toIsoDate(new Date(f.createdAt)))}</span></div>
                {f.comment ? <p>{f.comment}</p> : <p className="muted small">No comment</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
