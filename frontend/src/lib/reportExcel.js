// The sales report as an Excel file (.xlsx), for Leyah's records. Built in the browser from the figures on the page.

export const totalReceived = (report) => report.depositsCollected + report.balancesReceived

const BURGUNDY = 'FF7A2E4C'
const ROSE = 'FFF8E1E8'
const ROSE_LIGHT = 'FFFDF4F6'
const LINE = 'FFEACDD6'
const MUTED = 'FF7A6A70'
const PESO = '"₱"#,##0.00'
const COUNT = '#,##0'

const thin = { style: 'thin', color: { argb: LINE } }
const box = { top: thin, left: thin, bottom: thin, right: thin }
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

/** "Tue, Nov 3" for a yyyy-mm-dd date. */
const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}

const hasActivity = (d) => d.bookingsMade || d.bookingsCompleted || d.bookingsCancelled || d.bookingsNoShow || d.depositsCollected || d.balancesReceived

/**
 * Builds the workbook. `period` is the report's title, e.g. "November 2026" or "Fri, Nov 13, 2026".
 * Sheet "Summary": the money and the booking counts. A monthly report also gets "Days": every day with activity, with totals.
 */
export function buildSalesReportWorkbook(ExcelJS, { period, report, generatedAt = new Date() }) {
  const book = new ExcelJS.Workbook()
  book.creator = 'Nails by Leyah'
  book.created = generatedAt
  // Excel works out every formula (the Days totals) when the file opens, so a saved zero result can't be left blank.
  book.calcProperties.fullCalcOnLoad = true

  const sheet = book.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.6, right: 0.6, top: 0.7, bottom: 0.7, header: 0.3, footer: 0.3 } },
  })
  sheet.columns = [{ width: 4 }, { width: 44 }, { width: 20 }, { width: 4 }]

  // Title block
  sheet.mergeCells('B2:C2')
  Object.assign(sheet.getCell('B2'), { value: 'Nails by Leyah' })
  sheet.getCell('B2').font = { name: 'Georgia', size: 20, bold: true, color: { argb: BURGUNDY } }
  sheet.getRow(2).height = 30
  sheet.mergeCells('B3:C3')
  sheet.getCell('B3').value = `Sales report · ${period}`
  sheet.getCell('B3').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF3B2A30' } }
  sheet.mergeCells('B4:C4')
  sheet.getCell('B4').value = `Generated ${generatedAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`
  sheet.getCell('B4').font = { name: 'Calibri', size: 9, italic: true, color: { argb: MUTED } }

  let r = 6
  const section = (title, valueLabel) => {
    const row = sheet.getRow(r)
    row.getCell(2).value = title
    row.getCell(3).value = valueLabel
    row.height = 22
    for (const c of [2, 3]) {
      const cell = row.getCell(c)
      cell.fill = fill(BURGUNDY)
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'right' : 'left', indent: 1 }
      cell.border = box
    }
    r += 1
  }
  const line = (label, value, format, { strong = false, note } = {}) => {
    const row = sheet.getRow(r)
    row.getCell(2).value = note ? { richText: [{ text: label }, { text: `  ${note}`, font: { size: 9, italic: true, color: { argb: MUTED } } }] } : label
    row.getCell(3).value = value
    row.getCell(3).numFmt = format
    row.height = 20
    for (const c of [2, 3]) {
      const cell = row.getCell(c)
      cell.fill = fill(strong ? ROSE : (r % 2 ? 'FFFFFFFF' : ROSE_LIGHT))
      cell.font = { name: 'Calibri', size: 11, bold: strong, color: { argb: strong ? BURGUNDY : 'FF3B2A30' } }
      cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'right' : 'left', indent: 1 }
      cell.border = box
    }
    r += 1
  }

  section('Sales', 'Amount')
  line('Total received', totalReceived(report), PESO, { strong: true, note: 'online payments plus balances' })
  line('Paid online', report.depositsCollected, PESO, { note: 'deposits and full payments' })
  line('Balances received', report.balancesReceived, PESO, { note: 'paid after the service' })
  line('Completed services', report.completedServicesValue, PESO, { note: 'full price of appointments completed' })
  line('Balances unpaid', report.balancesUnpaid, PESO, { note: 'completed, not recorded yet' })
  r += 1
  section('Bookings', 'Count')
  line('Made', report.bookingsMade, COUNT, { note: 'new bookings placed' })
  line('Completed', report.bookingsCompleted, COUNT, { note: 'appointments finished' })
  line('Cancelled', report.bookingsCancelled, COUNT, { note: 'by clients or the salon' })
  line('No-show', report.bookingsNoShow, COUNT, { note: 'client did not come' })

  r += 1
  for (const text of [
    'Payments count on the day they were paid; everything else on the day it happened.',
    "For the salon's records; this is not an official receipt.",
  ]) {
    sheet.mergeCells(`B${r}:C${r}`)
    sheet.getCell(`B${r}`).value = text
    sheet.getCell(`B${r}`).font = { name: 'Calibri', size: 9, italic: true, color: { argb: MUTED } }
    r += 1
  }

  if (report.days) addDaysSheet(book, period, report.days)
  return book
}

/** Every day of the month with activity, newest last, with a totals row that adds them up. */
function addDaysSheet(book, period, days) {
  const sheet = book.addWorksheet('Days', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const columns = [
    { header: 'Date', key: 'date', width: 16, format: null },
    { header: 'Made', key: 'bookingsMade', width: 10, format: COUNT },
    { header: 'Completed', key: 'bookingsCompleted', width: 12, format: COUNT },
    { header: 'Cancelled', key: 'bookingsCancelled', width: 12, format: COUNT },
    { header: 'No-show', key: 'bookingsNoShow', width: 10, format: COUNT },
    { header: 'Paid online', key: 'depositsCollected', width: 16, format: PESO },
    { header: 'Balances received', key: 'balancesReceived', width: 19, format: PESO },
    { header: 'Total received', key: 'total', width: 17, format: PESO },
  ]
  sheet.columns = columns.map(({ key, width }) => ({ key, width }))

  sheet.mergeCells(1, 1, 1, columns.length)
  sheet.getCell('A1').value = `Days with activity · ${period}`
  sheet.getCell('A1').font = { name: 'Georgia', size: 14, bold: true, color: { argb: BURGUNDY } }
  sheet.getRow(1).height = 24

  const header = sheet.getRow(3)
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1)
    cell.value = c.header
    cell.fill = fill(BURGUNDY)
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', indent: i === 0 ? 1 : 0 }
    cell.border = box
  })
  header.height = 22

  const active = days.filter(hasActivity)
  if (active.length === 0) {
    sheet.mergeCells(4, 1, 4, columns.length)
    sheet.getCell('A4').value = 'No activity this month.'
    sheet.getCell('A4').font = { italic: true, color: { argb: MUTED } }
    return
  }

  active.forEach((d, i) => {
    const rowNumber = 4 + i
    const row = sheet.getRow(rowNumber)
    row.values = [dayLabel(d.date), d.bookingsMade, d.bookingsCompleted, d.bookingsCancelled, d.bookingsNoShow, d.depositsCollected, d.balancesReceived,
      { formula: `F${rowNumber}+G${rowNumber}`, result: d.depositsCollected + d.balancesReceived }]
    style(row, columns, i % 2 ? ROSE_LIGHT : 'FFFFFFFF', false)
  })

  // Totals add up the rows above, so the sheet stays right if Leyah edits a figure.
  const first = 4
  const last = 3 + active.length
  const totals = sheet.getRow(last + 1)
  totals.values = ['Total', ...columns.slice(1).map((c, i) => {
    const col = String.fromCharCode(66 + i) // B, C, ...
    return { formula: `SUM(${col}${first}:${col}${last})`, result: active.reduce((sum, d) => sum + (c.key === 'total' ? d.depositsCollected + d.balancesReceived : d[c.key]), 0) }
  })]
  style(totals, columns, ROSE, true)
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: last, column: columns.length } }
}

function style(row, columns, background, strong) {
  row.height = 19
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1)
    if (c.format) cell.numFmt = c.format
    cell.fill = fill(background)
    cell.font = { name: 'Calibri', size: 11, bold: strong, color: { argb: strong ? BURGUNDY : 'FF3B2A30' } }
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', indent: i === 0 ? 1 : 0 }
    cell.border = box
  })
}

/** Builds the file and hands it to the browser to save. */
export async function downloadSalesReport({ period, report, fileName }) {
  const ExcelJS = (await import('exceljs')).default
  const buffer = await buildSalesReportWorkbook(ExcelJS, { period, report }).xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
