import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, renderApp, signIn } from './helpers'
import { addDays, today } from '../lib/dates'
import { formatDate } from '../lib/format'

const monthName = (yearMonth) =>
  new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)) - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

describe('Sales reports date pickers', () => {
  it('changes the day with the arrows and the salon calendar (no "Any date": a report needs a day)', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/reports')

    expect(await screen.findByRole('heading', { name: formatDate(today()) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(await screen.findByRole('heading', { name: formatDate(addDays(today(), -1)) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Day: .*Change date$/ }))
    const calendar = screen.getByRole('dialog')
    expect(within(calendar).queryByRole('button', { name: 'Any date' })).toBeNull()
    await user.click(within(calendar).getByRole('button', { name: 'Today' }))
    expect(await screen.findByRole('heading', { name: formatDate(today()) })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('picks a month from a year of months', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/reports')
    await user.click(await screen.findByRole('tab', { name: 'Monthly' }))

    const thisMonth = today().slice(0, 7)
    expect(await screen.findByRole('heading', { name: monthName(thisMonth) })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Month: .*Change month$/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Previous year' }))
    const lastYearJanuary = `${Number(thisMonth.slice(0, 4)) - 1}-01`
    await user.click(screen.getByRole('button', { name: monthName(lastYearJanuary) }))
    expect(await screen.findByRole('heading', { name: monthName(lastYearJanuary) })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findByRole('heading', { name: monthName(`${lastYearJanuary.slice(0, 4)}-02`) })).toBeInTheDocument()
  })
})
