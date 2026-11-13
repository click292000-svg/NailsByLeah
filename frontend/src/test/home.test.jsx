import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './helpers'

describe('Home page', () => {
  it('shows every section, with starting prices from the live price list', async () => {
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Beautiful nails, booked in minutes.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Up close' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Our Works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nail Rules' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Find Nails by Leyah' })).toBeInTheDocument()

    const pricing = screen.getByRole('region', { name: 'Pricing' })
    expect(await within(pricing).findByText('₱250+')).toBeInTheDocument() // BIAB is the cheapest soft gel
    expect(within(pricing).getByText('₱100+')).toBeInTheDocument()
    expect(within(pricing).getByText('₱10+')).toBeInTheDocument()
    // The sets as clients book them, with "With design" as the option on top.
    expect(within(pricing).getByText('Plain • Soft Gel Extension • BIAB • With design (optional)')).toBeInTheDocument()
  })

  it('unfolds the full price list from the live prices, with the design versions and Rhinestone', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const pricing = screen.getByRole('region', { name: 'Pricing' })
    await within(pricing).findByText('₱250+')
    await user.click(within(pricing).getByRole('button', { name: 'View full price list' }))

    const card = within(pricing).getByRole('article', { name: 'Nails price list' })
    const row = (name) => within(card).getByText(name).closest('.pc-row')
    expect(row('Soft Gel Extension')).toHaveTextContent('₱399')
    expect(row('Soft Gel Extension with design')).toHaveTextContent('+₱100') // what the design adds, not the total
    expect(within(card).queryByText('Plain with design')).toBeNull() // Plain takes no design
    expect(row('BIAB with design')).toHaveTextContent('+₱100')
    expect(row('Rhinestone')).toHaveTextContent('₱15')
  })

  it('sends guests to sign up when they book, and links Explore and Pricing to their sections', () => {
    renderApp('/')
    expect(screen.getByRole('link', { name: 'Book an appointment' })).toHaveAttribute('href', '/register')
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/#tour')
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#prices')
  })

  it('opens and closes FAQ answers', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const question = screen.getByRole('button', { name: 'Do you accept walk-ins?' })
    expect(question).toHaveAttribute('aria-expanded', 'false')
    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'false')
  })
})
