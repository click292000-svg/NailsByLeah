import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb } from './mockBackend/db'

const me = () => getDb().users.find((u) => u.username === CLIENT.username)

describe('My profile', () => {
  it('shows the account, saves a new name and +63 number as 09…, and updates the greeting', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/profile')

    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument()
    expect(screen.getByText(`@${CLIENT.username}`)).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled() // nothing changed yet

    await user.clear(screen.getByLabelText(/First Name/))
    await user.type(screen.getByLabelText(/First Name/), 'Kylie')
    await user.clear(screen.getByLabelText(/Phone Number/))
    await user.type(screen.getByLabelText(/Phone Number/), '+639175550000')
    await user.click(save)

    expect(await screen.findByText('Your profile was saved.')).toBeInTheDocument()
    expect(me()).toMatchObject({ firstName: 'Kylie', phoneNumber: '09175550000' })
    expect(screen.getByRole('link', { name: /My profile \(Kylie\)/ })).toBeInTheDocument()
  })

  it('checks the fields before saving, and refuses a number another client uses', async () => {
    const user = userEvent.setup()
    const other = getDb().users.find((u) => u.role === 'Client' && u.id !== me().id && !u.isDeleted)
    await signIn(CLIENT)
    renderApp('/profile')

    const phone = await screen.findByLabelText(/Phone Number/)
    await user.clear(phone)
    await user.type(phone, '08171234567')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByText(/starting with 09 or \+639/)).toBeInTheDocument()

    await user.clear(phone)
    await user.type(phone, other.phoneNumber)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('This phone number is already registered.')).toBeInTheDocument()
    expect(me().phoneNumber).not.toBe(other.phoneNumber)
  })

  it('is there for the administrator too, and needs a sign-in', async () => {
    renderApp('/profile')
    expect(await screen.findByRole('heading', { name: /Log in/ })).toBeInTheDocument()
  })

  it('opens from the administrator menu', async () => {
    await signIn(ADMIN)
    renderApp('/profile')
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument()
    expect(screen.getAllByText(`@${ADMIN.username}`).length).toBeGreaterThan(0)
  })
})
