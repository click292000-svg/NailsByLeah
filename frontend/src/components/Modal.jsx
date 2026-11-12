import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { termsAndConditions, privacyPolicy } from '../content/legal'
import { Button } from './ui'

/**
 * Accessible dialog: focus moves inside, Escape and the backdrop close it, focus returns afterwards. It is drawn at
 * the end of the page body, so no card or animation it is opened from can tuck it under the sticky header.
 */
export function Modal({ title, onClose, children, footer, wide = false }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  // Runs once per opening, so typing inside the dialog never moves focus.
  useEffect(() => {
    const previouslyFocused = document.activeElement
    dialogRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
      previouslyFocused?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

const documents = { terms: termsAndConditions, privacy: privacyPolicy }

/**
 * Terms & Conditions / Privacy Policy in a readable, scrollable window (Ref 1.6). With `onReadToEnd`, it is called
 * once the reader has scrolled to the last line (straight away when the whole text fits), and the footer says so.
 */
export function LegalDocumentModal({ document: kind, onClose, onReadToEnd }) {
  const doc = documents[kind]
  const scrollRef = useRef(null)
  const [atEnd, setAtEnd] = useState(false)
  const reportedRef = useRef(false)

  const check = () => {
    const el = scrollRef.current
    if (!el || reportedRef.current) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      reportedRef.current = true
      setAtEnd(true)
      onReadToEnd?.()
    }
  }
  useEffect(check) // eslint-disable-line react-hooks/exhaustive-deps

  const footer = onReadToEnd ? (
    <>
      <span className="muted small legal-progress" aria-live="polite">
        {atEnd ? '✓ You have read to the end.' : 'Scroll to the end to continue.'}
      </span>
      {atEnd && <Button onClick={onClose}>Done</Button>}
    </>
  ) : <Button onClick={onClose}>Close</Button>

  return (
    <Modal title={doc.title} onClose={onClose} wide footer={footer}>
      <div className="legal-scroll" tabIndex={0} aria-label={`${doc.title} text`} ref={scrollRef} onScroll={check}>
        <p className="muted">Version {doc.version}{doc.updated && ` · Last updated ${doc.updated}`}</p>
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            {section.points && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}
            {[section.body ?? []].flat().map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </div>
    </Modal>
  )
}
