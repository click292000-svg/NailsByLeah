import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DateCalendar, SlotPicker } from '../components/SlotPicker'
import { dateFromToday } from '../lib/dates'
import { formatDate } from '../lib/format'

const day = (iso) => screen.getByRole('radio', { name: formatDate(iso) })

function Calendar({ initial = '', onChange = () => {} }) {
  const [value, setValue] = useState(initial)
  return <DateCalendar value={value} maxDaysAhead={30} onChange={(next) => { setValue(next); onChange(next) }} />
}

describe('Booking time list', () => {
  const date = dateFromToday(3) // nothing booked that day
  const show = (selectedTime = '') => {
    const onTimeChange = vi.fn()
    render(<SlotPicker date={date} onDateChange={() => {}} selectedTime={selectedTime} onTimeChange={onTimeChange} serviceId={1} />)
    return onTimeChange
  }

  it('groups the times by part of the day and shows when each one would end', async () => {
    const onTimeChange = show()
    const morning = await screen.findByRole('group', { name: 'Morning' })

    expect(within(screen.getByRole('group', { name: 'Evening' })).getByRole('button', { name: /^5:00 PM/ })).toBeInTheDocument()
    const first = within(morning).getAllByRole('button')[0]
    expect(first).toHaveTextContent(/^11:00 AMEnds 1:00 PM$/)
    expect(first).toHaveAccessibleName(/^11:00 AM – .*PM Available$/)
    fireEvent.click(first)
    expect(onTimeChange).toHaveBeenCalledWith('11:00:00')
  })

  it('marks the last time of the day and leaves out times that would end after closing', async () => {
    show()
    const evening = await screen.findByRole('group', { name: 'Evening' })

    // Plain takes 2 hours and the salon closes at 9:00 PM, so 7:00 PM is the last start.
    expect(screen.getByText(/The last time you can start on this day is/)).toHaveTextContent('7:00 PM, ending at 9:00 PM closing.')
    expect(within(evening).getByRole('button', { name: /^7:00 PM .*last time today/ })).toHaveTextContent('Last time')
    expect(within(evening).queryByRole('button', { name: /^7:30 PM/ })).toBeNull()
    expect(within(evening).queryByRole('button', { name: /^8:30 PM/ })).toBeNull()
  })

  it('says why a time before another appointment cannot be chosen', async () => {
    render(<SlotPicker date={dateFromToday(5)} onDateChange={() => {}} selectedTime="" onTimeChange={() => {}} serviceId={1} />)
    // Seeded booking #10 is at 1:00 PM that day; Plain at 11:00 would end at 1:00 PM with no break before it.
    const morning = await screen.findByRole('group', { name: 'Morning' })
    expect(within(morning).getAllByRole('button')[0]).toHaveTextContent('Runs into 1 PM')
  })

  it('confirms the whole appointment, with its end time, once a time is chosen', async () => {
    show('11:00:00')

    expect(await screen.findByText('11:00 AM – 1:00 PM')).toBeInTheDocument() // Plain takes 2 hours
  })
})

describe('Booking date calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the whole month, marks today, and grays out days already gone', () => {
    render(<Calendar />)

    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(30)
    expect(day('2026-11-19')).toBeDisabled()
    expect(day('2026-11-20')).toBeEnabled()
    expect(day('2026-11-20')).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })

  it('stops at the last bookable day, 30 days ahead', () => {
    render(<Calendar />)
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(day('2026-12-20')).toBeEnabled()
    expect(day('2026-12-21')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled()
  })

  it('reports the chosen day and marks it selected', () => {
    const onChange = vi.fn()
    render(<Calendar onChange={onChange} />)
    fireEvent.click(day('2026-11-25'))

    expect(onChange).toHaveBeenCalledWith('2026-11-25')
    expect(day('2026-11-25')).toBeChecked()
  })

  it('opens on the month of a date already chosen', () => {
    render(<Calendar initial="2026-12-05" />)

    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(day('2026-12-05')).toBeChecked()
  })

  it('moves by keyboard across months but never onto a day that cannot be booked', () => {
    const onChange = vi.fn()
    render(<Calendar initial="2026-11-27" onChange={onChange} />)

    day('2026-11-27').focus()
    fireEvent.keyDown(day('2026-11-27'), { key: 'ArrowDown' })
    expect(screen.getByText('December 2026')).toBeInTheDocument()
    expect(day('2026-12-04')).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith('2026-12-04')

    fireEvent.keyDown(day('2026-12-04'), { key: 'ArrowUp' })
    fireEvent.keyDown(day('2026-11-27'), { key: 'ArrowUp' })
    expect(day('2026-11-20')).toHaveFocus()
    onChange.mockClear()
    fireEvent.keyDown(day('2026-11-20'), { key: 'ArrowLeft' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
