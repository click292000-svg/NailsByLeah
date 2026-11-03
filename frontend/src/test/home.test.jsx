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
