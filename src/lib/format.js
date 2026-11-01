const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

/** ₱1,234.00 */
export const formatMoney = (amount) => money.format(Number(amount ?? 0))

/** "2026-11-05" → "Thu, Nov 5, 2026" */
export function formatDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** "14:00:00" → "2:00 PM" */
export function formatTime(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

/** ISO timestamp → "Nov 5, 2026, 2:00 PM" */
export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "SomeEnumValue" → "Some enum value" */
export function humanize(value) {
  return String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}
