import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb } from './mockBackend/db'
import { mockRequest } from './mockBackend/mockApi'

const account = () => getDb().users.find((u) => u.id === CLIENT.id || u.username === CLIENT.username)
const closeOpenBookings = () => getDb().bookings
  .filter((b) => b.clientId === account().id && ['Pending', 'Confirmed'].includes(b.status))
  .forEach((b) => { b.status = 'Completed' })

async function findClient(user) {
  await user.type(await screen.findByLabelText(/Search clients/), account().email)
  await user.click(await screen.findByRole('button', { name: `Open @${account().username}` }))
}

describe('Client directory', () => {
  it('lists every client A to Z by username, and nobody else', async () => {
    await signIn(ADMIN)
    renderApp('/admin/clients')

    const table = await screen.findByRole('table')
    const usernames = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)
    const expected = getDb().users.filter((u) => u.role === 'Client' && !u.isDeleted).map((u) => `@${u.username}`)
      .sort((a, b) => a.localeCompare(b)).slice(0, 20)
    expect(usernames).toEqual(expected)
    expect(usernames).not.toContain(`@${ADMIN.username}`)
  })

  it('finds clients by name, shows a new sign-up, and says when nothing matches', async () => {
    const user = userEvent.setup()
    await mockRequest('POST', '/auth/register', { body: { firstName: 'Zia', lastName: 'Lopez', username: 'zia.lopez', email: 'zia@example.test',
      phoneNumber: '+639185551234', password: 'ZiaPass123', confirmPassword: 'ZiaPass123', acceptTerms: true } })
    await signIn(ADMIN)
    renderApp('/admin/clients')

    await user.type(await screen.findByLabelText(/Search clients/), 'zia lopez')
    const row = (await screen.findByRole('button', { name: 'Open @zia.lopez' })).closest('tr')
    expect(row).toHaveTextContent('09185551234') // stored as 09…
    expect(row).toHaveTextContent('(not verified)')

    await user.clear(screen.getByLabelText(/Search clients/))
    await user.type(screen.getByLabelText(/Search clients/), 'nobody-at-all')
    expect(await screen.findByText('No clients match that search.')).toBeInTheDocument()
  })
})

describe('Deleting a client\'s data', () => {

  it('refuses while the client has an open booking', async () => {
    const user = userEvent.setup()
    getDb().bookings.find((b) => b.clientId === account().id).status = 'Pending'
    await signIn(ADMIN)
    renderApp('/admin/clients')

    await findClient(user)

    expect(await screen.findByText(/still has an open booking/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete this client's data/ })).toBeNull()
  })

  it('erases the client only after DELETE is typed, keeping the booking', async () => {
    const user = userEvent.setup()
    closeOpenBookings()
    const email = account().email
    const id = account().id
    const bookingsBefore = getDb().bookings.filter((b) => b.clientId === id).length
    await signIn(ADMIN)
    renderApp('/admin/clients')

    await findClient(user)
    await user.click(await screen.findByRole('button', { name: /Delete this client's data/ }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Delete permanently' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Type DELETE/), 'DELETE')
    await user.click(confirm)

    expect(await screen.findByText(/The client's data was deleted/)).toBeInTheDocument()
    const erased = getDb().users.find((u) => u.id === id)
    expect(erased).toMatchObject({ firstName: 'Deleted', lastName: 'Client', isDeleted: true })
    expect(erased.email).not.toBe(email)
    expect(getDb().bookings.filter((b) => b.clientId === id)).toHaveLength(bookingsBefore)
    await expect(mockRequest('POST', '/admin/clients/find', { body: { email } })).rejects.toMatchObject({ status: 404 })
  })

  it('is refused for clients', async () => {
    await signIn(CLIENT)
    await expect(mockRequest('POST', '/admin/clients/find', { body: { email: CLIENT.username } })).rejects.toMatchObject({ status: 403 })
  })
})
