import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { getDb } from './mockBackend/db'
import { formatDate } from '../lib/format'

// The day panel's heading: "Fri, Nov 13" (the calendar above shows the year).
const dayTitle = (iso) => new Date(`${iso}T00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
import { dateFromToday, today } from '../lib/dates'

const openPage = async () => {
  await signIn(ADMIN)
  renderApp('/admin/bookings')
  await screen.findByRole('heading', { name: 'Find bookings' })
}
const toggle = (name) => screen.getByRole('button', { name })
const listRows = () => within(screen.getByRole('heading', { name: 'All bookings' }).closest('.card')).getAllByRole('row').slice(1)
const activeBookings = () => getDb().bookings.filter((b) => !b.isDeleted)

describe('Find bookings', () => {
  it('A: opens with both panels hidden and the list showing, 10 a page', async () => {
    const user = userEvent.setup()
    await openPage()

    expect(toggle('Show calendar')).toHaveAttribute('aria-expanded', 'false')
    expect(toggle('Show booking details')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Booking calendar' })).toBeNull()
    const total = activeBookings().length
    await waitFor(() => expect(listRows()).toHaveLength(Math.min(10, total)))
    if (total > 10) {
      expect(screen.getByText(`Showing 1–10 of ${total}`)).toBeInTheDocument()
      expect(screen.getByText(`Page 1 of ${Math.ceil(total / 10)}`)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(listRows()).toHaveLength(Math.min(10, total - 10)))
      expect(screen.getByText(`Page 2 of ${Math.ceil(total / 10)}`)).toBeInTheDocument()
      // Page 1 is always one tap away.
      expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
      await user.click(screen.getByRole('button', { name: 'Page 1' }))
      await waitFor(() => expect(screen.getByText(`Page 1 of ${Math.ceil(total / 10)}`)).toBeInTheDocument())
    }
  })

  it('B and C: each panel opens on its own; the day panel starts on today', async () => {
    const user = userEvent.setup()
    await openPage()

    await user.click(toggle('Show calendar'))
    expect(await screen.findByRole('region', { name: 'Booking calendar' })).toBeInTheDocument()
    expect(toggle('Hide calendar')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('region', { name: 'Bookings on the chosen day' })).toBeNull()

    await user.click(toggle('Hide calendar'))
    await user.click(toggle('Show booking details'))
    expect(await screen.findByRole('heading', { name: `Bookings on ${dayTitle(today())}` })).toBeInTheDocument()
    expect(document.getElementById('fb-calendar')).toHaveAttribute('aria-hidden', 'true')
  })

  it('D: picking a day on the calendar lists that day only, and leaves the list alone', async () => {
    const user = userEvent.setup()
    const day = dateFromToday(1) // seeded booking #8
    const onDay = activeBookings().filter((b) => b.bookingDate === day)
    await openPage()
    await user.click(toggle('Show calendar'))
    await user.click(toggle('Show booking details'))

    const cal = await screen.findByRole('region', { name: 'Booking calendar' })
    if (day.slice(0, 7) !== today().slice(0, 7)) await user.click(within(cal).getByRole('button', { name: 'Next month' }))
    const dayButton = await within(cal).findByRole('radio', { name: new RegExp(`^${formatDate(day)}, ${onDay.length} booking`) })
    await user.click(dayButton)

    const panel = screen.getByRole('region', { name: 'Bookings on the chosen day' })
    expect(await within(panel).findByRole('heading', { name: `Bookings on ${dayTitle(day)}` })).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getAllByRole('row').slice(1)).toHaveLength(onDay.length))
    expect(listRows().length).toBeGreaterThan(onDay.length) // the All bookings list is not filtered by the calendar
  })

  it('E: hiding both panels keeps the chosen day and the list filters', async () => {
    const user = userEvent.setup()
    const day = dateFromToday(1)
    await openPage()
    await user.click(screen.getByRole('tab', { name: /Pending/ }))
    await user.click(toggle('Show calendar'))
    await user.click(toggle('Show booking details'))
    const cal = await screen.findByRole('region', { name: 'Booking calendar' })
    if (day.slice(0, 7) !== today().slice(0, 7)) await user.click(within(cal).getByRole('button', { name: 'Next month' }))
    await user.click(await within(cal).findByRole('radio', { name: new RegExp(`^${formatDate(day)}`) }))

    await user.click(toggle('Hide calendar'))
    await user.click(toggle('Hide booking details'))
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Pending bookings' })).toBeInTheDocument()

    await user.click(toggle('Show booking details'))
    expect(screen.getByRole('heading', { name: `Bookings on ${dayTitle(day)}` })).toBeInTheDocument()
  })

  it('says so when the chosen day has no bookings', async () => {
    const user = userEvent.setup()
    getDb().bookings.filter((b) => b.bookingDate === today()).forEach((b) => { b.isDeleted = true })
    await openPage()
    await user.click(toggle('Show booking details'))
    expect(await screen.findByText('No bookings scheduled for this date.')).toBeInTheDocument()
  })

  it('filters the list by service, and finds a booking by its payment reference', async () => {
    const user = userEvent.setup()
    await openPage()
    await screen.findByRole('option', { name: 'BIAB' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Service' }), 'BIAB')
    await waitFor(() => expect(listRows().every((r) => within(r).queryByText('BIAB'))).toBe(true))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Service' }), '')
    const payment = getDb().payments.find((p) => p.status === 'Succeeded')
    await user.type(screen.getByRole('searchbox', { name: 'Search bookings' }), payment.referenceNumber)
    await waitFor(() => expect(listRows()).toHaveLength(1))
  })
})
