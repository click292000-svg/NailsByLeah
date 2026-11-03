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

/** 90 → "1 hr 30 min", 60 → "1 hr", 45 → "45 min" */
export function formatDuration(minutes) {
  const h = Math.floor(Number(minutes) / 60)
  const m = Number(minutes) % 60
  return [h && `${h} hr`, m && `${m} min`].filter(Boolean).join(' ') || '0 min'
}

/** Salon hours from the API → "Open daily, 11:00 AM – 9:00 PM" */
export const formatHours = (hours) => `Open daily, ${formatTime(hours.openingTime)} – ${formatTime(hours.closingTime)}`

/** ISO timestamp → "Nov 5, 2026, 2:00 PM" */
export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "SomeEnumValue" → "Some enum value" */
export function humanize(value) {
  return String(value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}
