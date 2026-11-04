import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { termsAndConditions, privacyPolicy } from '../content/legal'
import { Button } from './ui'

/** Accessible dialog: focus moves inside, Escape and the backdrop close it, focus returns afterwards. */
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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

const documents = { terms: termsAndConditions, privacy: privacyPolicy }

/** Terms & Conditions / Privacy Policy in a readable, scrollable window (Ref 1.6). */
export function LegalDocumentModal({ document: kind, onClose }) {
  const doc = documents[kind]
  return (
    <Modal title={doc.title} onClose={onClose} wide footer={<Button onClick={onClose}>Close</Button>}>
      <div className="legal-scroll" tabIndex={0} aria-label={`${doc.title} text`}>
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
