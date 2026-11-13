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

const documents = {
  terms: termsAndConditions,
  privacy: privacyPolicy,
  // Sign-up: both documents in one window, read and agreed to once.
  both: {
    title: 'Terms & Privacy Policy',
    parts: [termsAndConditions, privacyPolicy],
  },
}

/**
 * A legal document (or, with "both", the Terms & Conditions and the Privacy Policy together) in a window: its version and date, the important reminders, then the full text in its own scroll box.
 * `onReadToEnd` is called once the text has been scrolled to the end. With `agree` ({ checked, read, onChange }) the window
 * ends with its own "I have read and agree" box, which unlocks once the text has been read to the end.
 */
export function LegalDocumentModal({ document: kind, onClose, onReadToEnd, agree }) {
  const doc = documents[kind]
  const parts = doc.parts ?? [doc]
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

  const canAgree = atEnd || Boolean(agree?.read)
  // The box only ticks; "Agree and continue" is what records the agreement.
  const [ticked, setTicked] = useState(Boolean(agree?.checked))
  const footer = agree ? (
    <div className="legal-agree-foot">
      <label className={canAgree ? 'legal-agree' : 'legal-agree is-locked'}>
        <input type="checkbox" checked={ticked} disabled={!canAgree} onChange={(e) => setTicked(e.target.checked)} />
        <span className="legal-agree-text">
          I have read and agree to the {doc.title}.
          {!canAgree && <small aria-live="polite">Scroll to the end of the text first.</small>}
        </span>
      </label>
      <div className="legal-actions">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button disabled={!ticked} onClick={() => { agree.onChange(true); onClose() }}>Agree and continue</Button>
      </div>
    </div>
  ) : onReadToEnd ? (
    <>
      <span className="muted small legal-progress" aria-live="polite">
        {atEnd ? '✓ You have read to the end.' : 'Scroll to the end to continue.'}
      </span>
      {atEnd && <Button onClick={onClose}>Done</Button>}
    </>
  ) : <Button onClick={onClose}>Close</Button>

  return (
    <Modal title={doc.title} onClose={onClose} wide footer={footer}>
      <p className="legal-lead">Please read the {doc.title} below.</p>
      <p className="legal-meta">
        {parts.map((part, i) => (
          <span key={part.title} className="legal-meta-item">
            {i > 0 && <span aria-hidden="true" className="legal-meta-dot">•</span>}
            {parts.length > 1 && `${part.title}: `}Version {part.version}{part.updated && ` (updated ${part.updated})`}
          </span>
        ))}
      </p>
      {parts.some((part) => part.reminders?.length) && (
        <div className="legal-reminders" role="note" aria-label="Important reminders">
          <p className="legal-reminders-title">Important reminders:</p>
          {parts.map((part) => part.reminders?.length > 0 && (
            <div key={part.title} className="legal-reminders-group">
              {parts.length > 1 && <p className="legal-reminders-sub">{part.title}</p>}
              <ul>{part.reminders.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
      <div className="legal-scroll" tabIndex={0} aria-label={`${doc.title} text`} ref={scrollRef} onScroll={check}>
        {parts.map((part) => (
          <div key={part.title} className="legal-part">
            {parts.length > 1 && <h2 className="legal-part-title">{part.title}</h2>}
            {part.sections.map((section) => (
              <section key={section.heading}>
                <h3>{section.heading}</h3>
                {section.points && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}
                {[section.body ?? []].flat().map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
