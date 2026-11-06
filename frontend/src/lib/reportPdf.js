// The sales report as a PDF, made in the browser from the figures already on the page. It holds totals only, no client
// names. The PDF's built-in font has no peso sign, so amounts are written "PHP 1,234.00". The library is loaded only when
// a report is downloaded, so it doesn't slow down the rest of the site.

const BURGUNDY = [104, 44, 67]
const INK = [48, 37, 42]
const MUTED = [120, 105, 112]
const LINE = [226, 214, 219]
const LEFT = 48
const RIGHT = 547 // A4 is 595pt wide
const PAGE_BOTTOM = 790

export const totalReceived = (report) => report.depositsCollected + report.balancesReceived

const php = (amount) => `PHP ${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Builds the document. `period` is the text under the title, e.g. "November 2026". */
export function buildSalesReportPdf(JsPdf, { period, report, generatedAt = new Date() }) {
  const doc = new JsPdf({ unit: 'pt', format: 'a4' })
  let y = 60

  const text = (value, x, options = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
    doc.setFontSize(options.size ?? 10)
    doc.setTextColor(...(options.color ?? INK))
    doc.text(String(value), x, y, { align: options.align ?? 'left' })
  }
  const rule = () => {
    doc.setDrawColor(...LINE)
    doc.line(LEFT, y, RIGHT, y)
  }
  const heading = (value) => {
    y += 26
    text(value, LEFT, { bold: true, size: 11, color: BURGUNDY })
    y += 6
    rule()
    y += 15
  }
  const row = (label, value, bold = false) => {
    text(label, LEFT, { bold })
    text(value, RIGHT, { bold, align: 'right' })
    y += 17
  }

  text('Nails by Leyah', LEFT, { bold: true, size: 18, color: BURGUNDY })
  y += 20
  text('Sales report', LEFT, { size: 12 })
  text(period, RIGHT, { bold: true, size: 12, align: 'right' })

  heading('Sales')
  row('Total received', php(totalReceived(report)), true)
  row('Paid online (deposits and full payments)', php(report.depositsCollected))
  row('Balances received after the service', php(report.balancesReceived))
  row('Completed services (full price)', php(report.completedServicesValue))
  row('Balances still unpaid', php(report.balancesUnpaid))

  y -= 6
  heading('Bookings')
  row('Made', report.bookingsMade)
  row('Completed', report.bookingsCompleted)
  row('Cancelled', report.bookingsCancelled)
  row('No-show', report.bookingsNoShow)

  if (report.days) {
    const columns = [
      { label: 'Date', x: LEFT, value: (d) => dayLabel(d.date) },
      { label: 'Made', x: 165, value: (d) => d.bookingsMade },
      { label: 'Completed', x: 228, value: (d) => d.bookingsCompleted },
      { label: 'Cancelled', x: 288, value: (d) => d.bookingsCancelled },
      { label: 'No-show', x: 340, value: (d) => d.bookingsNoShow },
      { label: 'Online', x: 430, value: (d) => php(d.depositsCollected) },
      { label: 'Balances', x: RIGHT, value: (d) => php(d.balancesReceived) },
    ]
    const header = () => {
      columns.forEach((c, i) => text(c.label, c.x, { bold: true, size: 8.5, color: MUTED, align: i === 0 ? 'left' : 'right' }))
      y += 14
    }
    const active = report.days.filter((d) => d.bookingsMade || d.bookingsCompleted || d.bookingsCancelled || d.bookingsNoShow || d.depositsCollected || d.balancesReceived)

    y -= 6
    heading('Days with activity')
    if (active.length === 0) {
      text('No activity this month.', LEFT, { color: MUTED })
      y += 14
    } else {
      header()
      active.forEach((d) => {
        if (y > PAGE_BOTTOM - 15) {
          doc.addPage()
          y = 60
          header()
        }
        columns.forEach((c, i) => text(c.value(d), c.x, { size: 9, align: i === 0 ? 'left' : 'right' }))
        y += 12.5
      })
    }
  }

  y = Math.max(y + 18, 0)
  if (y > PAGE_BOTTOM) {
    doc.addPage()
    y = 60
  }
  rule()
  y += 14
  text('Online payments and balances are counted on the day they were paid. Completed services, no-shows and unpaid balances', LEFT, { size: 8, color: MUTED })
  y += 11
  text('are counted on the appointment date. For the salon\'s records; this is not an official receipt.', LEFT, { size: 8, color: MUTED })
  y += 11
  text(`Generated ${generatedAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`, LEFT, { size: 8, color: MUTED })
  return doc
}

export async function downloadSalesReport({ period, report, fileName }) {
  const { jsPDF } = await import('jspdf')
  buildSalesReportPdf(jsPDF, { period, report }).save(fileName)
}
