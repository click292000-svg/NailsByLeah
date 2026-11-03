import { useState } from 'react'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage } from '../../api/errors'
import { formatDate } from '../../lib/format'
import { toIsoDate } from '../../lib/dates'
import { Alert, Button, Card, EmptyState, PageHeader, PageLoader, Spinner } from '../../components/ui'
import { Stars } from '../../components/StarRating'

const PAGE_SIZE = 20

/** Client ratings and comments, newest first, with the average and how the ratings are spread. */
export default function AdminFeedbackPage() {
  const [page, setPage] = useState(1)
  const list = useAsync(() => api.admin.feedback({ page, pageSize: PAGE_SIZE }), [page])

  if (list.loading && !list.data) return <PageLoader label="Loading feedback…" />
  if (list.error) return <Alert kind="error">{errorMessage(list.error)}</Alert>

  const { items, totalCount, averageRating, countsByRating } = list.data
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="stack">
      <PageHeader title="Customer feedback" subtitle="Star ratings and comments from your clients." />
      <div className="feedback-overview">
        <Card className="feedback-average">
          <span className="feedback-average-number">{totalCount ? averageRating.toFixed(1) : '–'}</span>
          <Stars rating={averageRating} size="lg" />
          <span className="muted small">{totalCount} rating{totalCount === 1 ? '' : 's'}</span>
        </Card>
        <Card title="Ratings">
          <ul className="rating-bars">
            {[5, 4, 3, 2, 1].map((r) => {
              const count = countsByRating[r] ?? 0
              return (
                <li key={r}>
                  <span>{r} ★</span>
                  <span className="rating-bar" aria-hidden="true"><i style={{ width: `${totalCount ? (count / totalCount) * 100 : 0}%` }} /></span>
                  <span className="muted small">{count}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <Card title="All feedback" actions={list.loading ? <Spinner small label="Refreshing" /> : null}>
        {items.length === 0 ? <EmptyState title="No feedback yet" /> : (
          <ul className="feedback-list">
            {items.map((f) => (
              <li key={f.id}>
                <div className="feedback-meta">
                  <Stars rating={f.rating} size="sm" />
                  <strong>{f.client ? `${f.client.firstName} ${f.client.lastName}` : 'Client'}</strong>
                  <span className="muted small">{formatDate(toIsoDate(new Date(f.createdAt)))}</span>
                </div>
                {f.comment ? <p>{f.comment}</p> : <p className="muted small">No comment</p>}
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="row pager">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="muted small">Page {page} of {pages}</span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
