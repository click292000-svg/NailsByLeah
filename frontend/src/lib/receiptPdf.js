// The payment receipt as a PDF, built in the browser from the receipt the server returns for a verified payment. The
// server decides who may see it (the client who booked, or the salon) and only marks it verified once Leyah has checked
// the payment. The PDF's built-in font has no peso sign, so amounts are written "PHP 1,234.00".

import { formatDate, formatTime } from './format'

const BURGUNDY = [104, 44, 67]
const ROSE = [240, 213, 220]
const BLUSH = [251, 240, 243]
const INK = [48, 37, 42]
const MUTED = [120, 105, 112]
const LINE = [226, 214, 219]
const GREEN = [31, 107, 70]
const LEFT = 56
const RIGHT = 539 // A4 is 595pt wide

const php = (amount) => `PHP ${Number(amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '')

/** A receipt can be downloaded only for a payment the salon has verified. */
export const canDownloadReceipt = (receipt) => Boolean(receipt?.verified)

export const receiptFileName = (receipt) => `nails-by-leyah-receipt-${receipt.referenceNumber}.pdf`

export function buildReceiptPdf(JsPdf, receipt, generatedAt = new Date()) {
  const doc = new JsPdf({ unit: 'pt', format: 'a4' })
  let y = 0

  const text = (value, x, options = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
    doc.setFontSize(options.size ?? 10)
    doc.setTextColor(...(options.color ?? INK))
    doc.text(String(value ?? ''), x, y, { align: options.align ?? 'left', maxWidth: options.maxWidth })
  }
  const rule = (color = LINE) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(0.8)
    doc.line(LEFT, y, RIGHT, y)
  }
  const heading = (value) => {
    y += 30
    text(value.toUpperCase(), LEFT, { bold: true, size: 9, color: BURGUNDY })
    y += 7
    rule()
    y += 17
  }
  const row = (label, value, options = {}) => {
    text(label, LEFT, { color: options.labelColor ?? MUTED, bold: options.bold })
    text(value, RIGHT, { align: 'right', bold: options.bold, color: options.color })
    y += 18
  }

  // Header band
  doc.setFillColor(...BLUSH)
  doc.rect(0, 0, 595, 118, 'F')
  doc.setFillColor(...BURGUNDY)
  doc.rect(0, 118, 595, 3, 'F')
  y = 58
  text('Nails by Leyah', LEFT, { bold: true, size: 24, color: BURGUNDY })
  text('PAYMENT RECEIPT', RIGHT, { bold: true, size: 11, color: BURGUNDY, align: 'right' })
  y += 22
  text('Soft gel · BIAB · Removal', LEFT, { size: 9, color: MUTED })
  text(`Receipt no. ${receipt.referenceNumber}`, RIGHT, { size: 9, color: INK, align: 'right' })

  // Status pill: paid and verified, or what happened since (cancelled / no-show, and the refund).
  const closed = receipt.bookingStatus === 'Cancelled' || receipt.bookingStatus === 'NoShow'
  const refund = Number(receipt.refundDue ?? 0)
  const pill = !closed
    ? `PAID · VERIFIED ${receipt.verifiedAt ? new Date(receipt.verifiedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : ''}`
    : `${receipt.bookingStatus === 'NoShow' ? 'NO-SHOW' : 'CANCELLED'}${refund > 0 ? (receipt.refundSentAt ? ' · REFUNDED' : ' · REFUND DUE') : ''}`
  y = 156
  doc.setFillColor(...(closed ? [253, 240, 210] : [223, 243, 232]))
  doc.roundedRect(LEFT, y - 14, Math.max(170, doc.getTextWidth(pill) * 1.1 + 30), 22, 11, 11, 'F')
  text(pill, LEFT + 12, { bold: true, size: 9, color: closed ? [138, 90, 0] : GREEN })

  heading('Billed to')
  row('Client', receipt.clientName ?? '')
  row('Booking reference', `#${receipt.bookingId}`)
  row('Appointment', `${formatDate(receipt.bookingDate)}, ${formatTime(receipt.startTime)}`)

  heading('Services')
  const lines = receipt.lines?.length ? receipt.lines : [{ description: receipt.serviceName, amount: receipt.totalAmount }]
  for (const line of lines) row(line.description, php(line.amount), { labelColor: INK })
  y += 2
  rule(ROSE)
  y += 20
  row('Total service amount', php(receipt.totalAmount), { bold: true, labelColor: INK })

  heading('Payment')
  row('Payment option', receipt.paymentOption === 'Full' ? 'Full payment' : 'Deposit (non-refundable)')
  row('Payment method', receipt.method)
  row('Transaction reference', receipt.referenceNumber)
  row('Payment date', when(receipt.paidAt))
  row('Payment status', receipt.verified ? `Verified by the salon${receipt.verifiedAt ? ` on ${when(receipt.verifiedAt)}` : ''}` : 'Paid')
  if (closed) {
    row('Booking status', receipt.bookingStatus === 'NoShow' ? 'No-show' : 'Cancelled')
    if (refund > 0) {
      row('Refund', receipt.refundSentAt ? `Sent ${when(receipt.refundSentAt)}` : 'To be sent to the account you paid from')
      if (receipt.refundReference) row('Refund reference', receipt.refundReference)
    }
  }

  // Amount box
  y += 12
  doc.setFillColor(...BLUSH)
  doc.setDrawColor(...ROSE)
  doc.roundedRect(LEFT, y, RIGHT - LEFT, 62, 8, 8, 'FD')
  y += 24
  const box = (label, value, x, align) => {
    text(label, x, { size: 9, color: MUTED, align })
    y += 20
    text(value, x, { bold: true, size: 14, color: BURGUNDY, align })
    y -= 20
  }
  box('Amount paid', php(receipt.amountPaid || receipt.amount), LEFT + 16, 'left')
  if (closed) box(refund > 0 ? (receipt.refundSentAt ? 'Refunded' : 'Refund due') : 'Refund', php(refund), RIGHT - 16, 'right')
  else box('Remaining balance (pay at the salon)', php(receipt.balanceDue), RIGHT - 16, 'right')
  y += 66

  text(closed
    ? 'The PHP 150 booking deposit is kept for client cancellations and no-shows; when the salon cancels, everything is refunded.'
    : 'The booking deposit is non-refundable. Please bring this receipt or its reference number to your appointment.', LEFT,
    { size: 8.5, color: MUTED, maxWidth: RIGHT - LEFT })
  y += 14
  text(`Issued ${when(generatedAt.toISOString())} from the Nails by Leyah booking system.`, LEFT, { size: 8.5, color: MUTED })
  return doc
}

export async function downloadReceipt(receipt) {
  const { jsPDF } = await import('jspdf')
  buildReceiptPdf(jsPDF, receipt).save(receiptFileName(receipt))
}
