import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, pickShade, renderApp, signIn } from './helpers'

const startBooking = async (user) => {
  await signIn(CLIENT)
  renderApp('/book')
  await user.click(await screen.findByRole('checkbox', { name: /^Plain/ }))
}
const chart = () => screen.getByRole('dialog', { name: 'Choose Nail Color' })

describe('Colour chart', () => {
  it('shows all 58 numbered shades, one chosen at a time, with a large preview', async () => {
    const user = userEvent.setup()
    await startBooking(user)
    await user.click(screen.getByRole('button', { name: 'Open the colour chart' }))

    const shades = within(chart()).getAllByRole('radio')
    expect(shades).toHaveLength(58)
    expect(shades[0]).toHaveAccessibleName('Shade #01, Bright White')
    expect(shades[57]).toHaveAccessibleName('Shade #58, Dark Plum-Black')
    expect(within(chart()).getByRole('button', { name: 'Use This Color' })).toBeDisabled()

    await user.click(within(chart()).getByRole('radio', { name: /^Shade #06,/ }))
    await user.click(within(chart()).getByRole('radio', { name: /^Shade #41,/ }))
    expect(within(chart()).getAllByRole('radio', { checked: true })).toHaveLength(1)
    expect(within(chart()).getByRole('radio', { name: /^Shade #41,/ })).toBeChecked()
    expect(within(chart()).getByRole('heading', { name: 'Bubblegum Pink' })).toBeInTheDocument()
    expect(within(chart()).getByRole('button', { name: 'Clear #41' })).toBeInTheDocument()
  })

  it('saves the shade only with Use This Color, and shows it in the total', async () => {
    const user = userEvent.setup()
    await startBooking(user)
    await pickShade(user, '06')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Colour #06 – Light Pink-Lavender. Change colour' })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary')).getByText('#06 – Light Pink-Lavender')).toBeInTheDocument()

    // Picking another shade, then closing without confirming, keeps #06.
    await user.click(screen.getByRole('button', { name: 'Colour #06 – Light Pink-Lavender. Change colour' }))
    expect(within(chart()).getByRole('radio', { name: /^Shade #06,/ })).toBeChecked()
    await user.click(within(chart()).getByRole('radio', { name: /^Shade #30,/ }))
    await user.click(within(chart()).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Colour #06 – Light Pink-Lavender. Change colour' })).toBeInTheDocument()

    // Clearing in the window and closing also keeps it.
    await user.click(screen.getByRole('button', { name: 'Colour #06 – Light Pink-Lavender. Change colour' }))
    await user.click(within(chart()).getByRole('button', { name: 'Clear #06' }))
    expect(within(chart()).getByText('No color selected yet.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Colour #06 – Light Pink-Lavender. Change colour' })).toBeInTheDocument()
  })

  it('still offers deciding the colour at the salon', async () => {
    const user = userEvent.setup()
    await startBooking(user)

    await user.click(screen.getByRole('radio', { name: 'Not sure yet (decide at the salon)' }))

    expect(screen.getByRole('radio', { name: 'Not sure yet (decide at the salon)' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Open the colour chart' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Next:/ }))
    expect(screen.queryByText('Choose a nail colour to continue.')).toBeNull()
  })
})
