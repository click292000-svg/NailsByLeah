import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, readTermsAndAgree, renderApp, signIn, pickDate } from './helpers'
import { getDb } from './mockBackend/db'
import { dateFromToday } from '../lib/dates'

// Leyah's revisions of 2026-11-12 on the booking page.

async function payFromServiceStep(user) {
  await user.click(screen.getByRole('button', { name: /^Next:/ }))
  pickDate(dateFromToday(3))
  await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))
  await user.click(screen.getByRole('button', { name: /^Next:/ }))
  await readTermsAndAgree(user)
  await user.click(screen.getByRole('button', { name: /^Pay/ }))
  expect(await screen.findByRole('heading', { name: 'Booking received!' })).toBeInTheDocument()
}

const shade = (chart, n) => within(chart).getByRole('radio', { name: new RegExp(`^Shade #${n},`) })

describe('Booking revisions', () => {
  it('shows the services in order, then an optional Design section with one "With Design" card for Plain and BIAB', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    expect(await screen.findByRole('heading', { name: 'Services' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Design (optional)' })).toBeInTheDocument()
    const names = [...document.querySelectorAll('.service-photos .choice-name, .design-card .choice-name')].map((n) => n.textContent)
    expect(names).toEqual(['Plain', 'Soft Gel Extension', 'BIAB', 'With Design'])

    await user.click(screen.getByRole('checkbox', { name: /^BIAB/ }))
    await user.click(screen.getByRole('checkbox', { name: /^With Design/ }))
    const aside = within(screen.getByRole('complementary'))
    expect(aside.getByText('Total').nextSibling).toHaveTextContent('₱350.00')
    expect(screen.getByRole('checkbox', { name: /^BIAB/ })).toBeChecked() // the BIAB card stays chosen
    expect(screen.getByRole('heading', { name: 'Nail Art (add-ons)' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Rhinestone/ })).toBeEnabled()

    // Soft Gel Extension has no design version.
    await user.click(screen.getByRole('checkbox', { name: /^Soft Gel Extension/ }))
    expect(screen.getByRole('checkbox', { name: /^With Design/ })).toBeDisabled()
  })

  it('keeps an add-on at 1 nail; only × removes it', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^With Design/ }))
    await user.click(screen.getByRole('checkbox', { name: /Rhinestone/ }))
    await user.click(screen.getByRole('radio', { name: 'Left hand' }))
    for (let i = 0; i < 4; i += 1) await user.click(screen.getByRole('button', { name: 'Fewer nails for Rhinestone' }))
    expect(screen.getByText('1 nail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fewer nails for Rhinestone' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Remove Rhinestone' }))
    expect(screen.getByRole('checkbox', { name: /Rhinestone/ })).not.toBeChecked()
  })

  it("books a colour that isn't on the chart as a request waiting for Leyah", async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    await user.click(screen.getByRole('button', { name: 'Open the colour chart' }))
    const chart = screen.getByRole('dialog', { name: 'Choose Nail Color' })
    await user.click(within(chart).getByRole('radio', { name: "Can't find your colour?" }))
    expect(within(chart).getByRole('button', { name: 'Ask Leyah for This Colour' })).toBeDisabled()
    expect(within(chart).getByText(/Describe the colour you're looking for/)).toBeInTheDocument()

    await user.type(within(chart).getByLabelText(/Describe the colour you'd like/), 'Dusty sage green')
    await user.click(within(chart).getByRole('button', { name: 'Ask Leyah for This Colour' }))
    expect(screen.getByRole('button', { name: 'Colour request. Change colour' })).toHaveTextContent('Dusty sage green')
    expect(screen.getByLabelText(/Photo of the colour/)).toBeInTheDocument() // the photo is added on the page
    await payFromServiceStep(user)

    expect(getDb().bookings.at(-1)).toMatchObject({ nailColor: null, colorRequest: 'Dusty sage green', colorRequestStatus: 'Pending' })
  })

  it('takes a colour for each nail in the chart window, left hand first, and needs all ten once started', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/book')

    await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
    await user.click(screen.getByRole('button', { name: 'Open the colour chart' }))
    const chart = screen.getByRole('dialog', { name: 'Choose Nail Color' })
    const right = within(chart).getByRole('group', { name: 'Right hand' })
    expect(within(right).getAllByRole('button')[0]).toBeDisabled() // the right hand waits for the left

    // Tap a nail, then shades: each shade goes on the next empty nail.
    await user.click(within(chart).getByRole('button', { name: /^Left hand, thumb/ }))
    for (let i = 0; i < 5; i += 1) await user.click(shade(chart, '06'))
    expect(within(right).getAllByRole('button')[0]).toBeEnabled()
    await user.click(shade(chart, '30'))
    expect(within(chart).getByRole('button', { name: 'Use These Colours' })).toBeDisabled()
    expect(within(chart).getByText(/Choose all 10 nails/)).toBeInTheDocument()

    for (let i = 0; i < 4; i += 1) await user.click(shade(chart, '30'))
    await user.click(within(chart).getByRole('button', { name: 'Use These Colours' }))
    expect(screen.getByRole('button', { name: 'A colour for each nail. Change colours' })).toBeInTheDocument()
    await payFromServiceStep(user)

    expect(getDb().bookings.at(-1).perNailColors).toEqual({ left: ['#06', '#06', '#06', '#06', '#06'], right: ['#30', '#30', '#30', '#30', '#30'] })
  })
})
