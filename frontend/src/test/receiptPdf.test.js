import { jsPDF } from 'jspdf'
import { buildReceiptPdf, canDownloadReceipt, receiptFileName } from '../lib/receiptPdf'

const receipt = {
  bookingId: 42, referenceNumber: 'GC-20261111-ABC', method: 'GCash', amount: 150, amountPaid: 150, paidAt: '2026-11-11T03:00:00Z',
  status: 'Succeeded', paymentOption: 'Deposit', totalAmount: 570, balanceDue: 420, bookingDate: '2026-11-20', startTime: '13:00:00',
  clientName: 'Kyla Santos', verified: true, verifiedAt: '2026-11-11T05:00:00Z', serviceName: 'With Design',
  lines: [{ description: 'With Design', amount: 400 }, { description: 'French Tip (both hands, 10 nails)', amount: 150 }, { description: 'Chrome (right hand, 2 nails)', amount: 20 }],
}

describe('PDF payment receipt', () => {
  it('is only offered for a payment the salon has verified', () => {
    expect(canDownloadReceipt(receipt)).toBe(true)
    expect(canDownloadReceipt({ ...receipt, verified: false })).toBe(false)
    expect(canDownloadReceipt(null)).toBe(false)
  })

  it('holds the business, client, booking, services and payment details', () => {
    const text = buildReceiptPdf(jsPDF, receipt).output()
    for (const part of ['Nails by Leyah', 'PAYMENT RECEIPT', 'GC-20261111-ABC', 'Kyla Santos', '#42', 'both hands, 10 nails',
      'PHP 570.00', 'PHP 150.00', 'PHP 420.00', 'non-refundable', 'GCash', 'Verified by the salon']) {
      expect(text).toContain(part)
    }
    expect(buildReceiptPdf(jsPDF, receipt).getNumberOfPages()).toBe(1)
    expect(receiptFileName(receipt)).toBe('nails-by-leyah-receipt-GC-20261111-ABC.pdf')
  })

  it('says Full payment for a booking paid in full', () => {
    expect(buildReceiptPdf(jsPDF, { ...receipt, paymentOption: 'Full', amountPaid: 570, balanceDue: 0 }).output()).toContain('Full payment')
  })
})

describe('PDF receipt after a cancellation', () => {
  it('shows the refund instead of a balance', () => {
    const text = buildReceiptPdf(jsPDF, { ...receipt, paymentOption: 'Full', amountPaid: 570, balanceDue: 0, bookingStatus: 'Cancelled',
      refundDue: 420, refundSentAt: '2026-11-12T02:00:00Z', refundReference: 'GC-RF-1' }).output()
    for (const part of ['CANCELLED', 'REFUNDED', 'PHP 420.00', 'GC-RF-1', 'Refunded']) expect(text).toContain(part)
    expect(text).not.toContain('Remaining balance')
  })

  it('says the refund is still due before Leyah sends it', () => {
    const text = buildReceiptPdf(jsPDF, { ...receipt, bookingStatus: 'NoShow', refundDue: 0 }).output()
    expect(text).toContain('NO-SHOW')
    expect(text).not.toContain('REFUND DUE')
    expect(buildReceiptPdf(jsPDF, { ...receipt, bookingStatus: 'Cancelled', refundDue: 150 }).output()).toContain('REFUND DUE')
  })
})
