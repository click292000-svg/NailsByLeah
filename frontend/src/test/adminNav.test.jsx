import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'

const trigger = (name) => screen.getByRole('button', { name })
const panelOf = (button) => document.getElementById(button.getAttribute('aria-controls'))

async function openAdmin(route = '/admin') {
  await signIn(ADMIN)
  renderApp(route)
  await screen.findByRole('button', { name: 'Management' })
  return userEvent.setup()
}

describe('Admin navigation', () => {
  it('groups every admin page and keeps its address', async () => {
    await openAdmin()
    const nav = screen.getByRole('navigation', { name: 'Main' })

    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin')
    const hrefs = (name) => [...panelOf(trigger(name)).querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs('Management')).toEqual(['/admin/bookings', '/admin/services', '/admin/schedule', '/admin/clients'])
    expect(hrefs('Insights')).toEqual(['/admin/reports', '/admin/feedback', '/admin/activity'])
  })

  it('opens on click, one at a time, and goes to the chosen page', async () => {
    const user = await openAdmin()

    expect(trigger('Management')).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger('Management'))
    expect(trigger('Management')).toHaveAttribute('aria-expanded', 'true')
    await user.click(trigger('Insights'))
    expect(trigger('Management')).toHaveAttribute('aria-expanded', 'false')
    expect(trigger('Insights')).toHaveAttribute('aria-expanded', 'true')

    await user.click(within(panelOf(trigger('Insights'))).getByRole('link', { name: 'Reports' }))
    expect(await screen.findByRole('heading', { name: 'Sales reports' })).toBeInTheDocument()
    expect(trigger('Insights')).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when clicking outside', async () => {
    const user = await openAdmin()

    await user.click(trigger('Management'))
    await user.click(document.querySelector('main'))

    expect(trigger('Management')).toHaveAttribute('aria-expanded', 'false')
  })

  it('works with the keyboard', async () => {
    const user = await openAdmin()
    const management = trigger('Management')

    management.focus()
    await user.keyboard('{ArrowDown}')
    expect(management).toHaveAttribute('aria-expanded', 'true')
    const panel = within(panelOf(management))
    expect(panel.getByRole('link', { name: 'Bookings' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(panel.getByRole('link', { name: 'Services' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(panel.getByRole('link', { name: 'Client data' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(panel.getByRole('link', { name: 'Bookings' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(management).toHaveAttribute('aria-expanded', 'false')
    expect(management).toHaveFocus()
  })

  it('closes when tabbing away', async () => {
    const user = await openAdmin()

    trigger('Insights').focus()
    await user.keyboard('{Enter}')
    expect(trigger('Insights')).toHaveAttribute('aria-expanded', 'true')
    await user.tab({ shift: true })

    expect(trigger('Insights')).toHaveAttribute('aria-expanded', 'false')
  })

  it('marks the current page and its group', async () => {
    await openAdmin('/admin/schedule')

    expect(trigger('Management')).toHaveClass('active')
    expect(trigger('Insights')).not.toHaveClass('active')
    expect(within(panelOf(trigger('Management'))).getByRole('link', { name: 'Schedule' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('active')
  })

  it('puts the account and logging out in the profile menu', async () => {
    const user = await openAdmin()

    const profile = screen.getByRole('button', { name: /^Account:/ })
    await user.click(profile)
    expect(within(panelOf(profile)).getByText(`@${ADMIN.username}`)).toBeInTheDocument()
    expect(within(panelOf(profile)).getByText('Administrator')).toBeInTheDocument()

    await user.click(within(panelOf(profile)).getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('is only for administrators', async () => {
    await signIn(CLIENT)
    renderApp('/bookings')

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Management' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })
})
