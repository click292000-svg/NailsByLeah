// Calendar helpers working in the browser's local time (the salon's time zone when used in the Philippines).

const pad = (n) => String(n).padStart(2, '0')

/** Date → "yyyy-mm-dd" in local time. */
export const toIsoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const today = () => toIsoDate(new Date())

/** "yyyy-mm-dd" + n days. */
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return toIsoDate(new Date(y, m - 1, d + days))
}

export const dateFromToday = (days) => addDays(today(), days)

/** Local Date for an appointment date + "HH:mm:ss". */
export function startsAt(isoDate, time) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}

export const hoursUntil = (isoDate, time) => (startsAt(isoDate, time).getTime() - Date.now()) / 3_600_000

/** "10:00:00" + 120 → "12:00:00" */
export function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}:00`
}

/** ISO timestamp n minutes from now (negative for the past). */
export const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString()

export const daysInMonth = (year, month) => new Date(year, month, 0).getDate()
