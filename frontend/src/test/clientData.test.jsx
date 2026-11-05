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
  await user.type(await screen.findByLabelText(/Client's email address/), account().email)
  await user.click(screen.getByRole('button', { name: 'Find client' }))
}

describe('Deleting a client\'s data', () => {
  it('says so when no client has that email', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/clients')

    await user.type(await screen.findByLabelText(/Client's email address/), 'nobody@example.test')
    await user.click(screen.getByRole('button', { name: 'Find client' }))

    expect(await screen.findByText(/No client account was found/)).toBeInTheDocument()
  })

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
