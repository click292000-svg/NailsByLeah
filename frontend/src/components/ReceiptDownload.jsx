import { useState } from 'react'
import { Button } from './ui'
import { canDownloadReceipt, downloadReceipt } from '../lib/receiptPdf'

/**
 * "Download receipt (PDF)" for a payment the salon has verified. Before that the button is off and says why: a paid
 * booking waits for Leyah to check the payment.
 */
export function ReceiptDownload({ receipt, load, variant = 'primary' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ready = receipt ? canDownloadReceipt(receipt) : true
  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = receipt ?? (await load())
      if (!canDownloadReceipt(data)) throw new Error('The receipt is available once the salon verifies the payment.')
      await downloadReceipt(data)
    } catch (err) {
      setError(err.message || 'The receipt could not be downloaded. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="receipt-download">
      {!ready && <span className="muted small">Available once Leyah verifies your payment.</span>}
      {error && <span className="field-error">{error}</span>}
      <Button variant={variant} loading={busy} disabled={!ready} onClick={run}>Download receipt (PDF)</Button>
    </span>
  )
}
