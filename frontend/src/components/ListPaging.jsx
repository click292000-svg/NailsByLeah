import { useSearchParams } from 'react-router'
import { Pager } from './ui'

/** Rows per page on the admin lists (Find bookings, Clients, Activity log). */
export const LIST_PAGE_SIZE = 10

/**
 * The list's page, kept in the address (?page=2) so a refresh stays on it. Going to another page brings the top of the
 * list (the element marked with `listSelector`) back into view; `reset()` returns to page 1, for a new search or filter.
 */
export function usePageParam(listSelector) {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)

  const write = (n) => {
    const next = new URLSearchParams(params)
    if (n > 1) next.set('page', String(n))
    else next.delete('page')
    setParams(next, { replace: true })
  }
  const goTo = (n) => {
    write(n)
    document.querySelector(listSelector)?.scrollIntoView?.({ block: 'start' })
  }
  return { page, goTo, reset: () => write(1) }
}

/**
 * Under a paged list: "Showing 11–20 of 32" (or "All 8 bookings shown") and the page numbers. Same on every admin
 * list, styled after Find bookings.
 */
export function ListPaging({ page, count, onChange, pageSize = LIST_PAGE_SIZE, noun = ['item', 'items'] }) {
  if (!count) return null
  const pages = Math.max(1, Math.ceil(count / pageSize))
  return (
    <div className="list-paging">
      <span className="muted small">
        {count > pageSize
          ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} of ${count}`
          : `All ${count} ${count === 1 ? noun[0] : noun[1]} shown`}
      </span>
      <Pager page={page} pages={pages} onChange={onChange} />
    </div>
  )
}
