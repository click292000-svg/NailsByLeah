import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb, saveDb } from './mockBackend/db'

const me = () => getDb().users.find((u) => u.username === CLIENT.username)

describe('My profile', () => {
  it('shows the account, saves a new name and +63 number as 09…, and updates the greeting', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/profile')

    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText(`@${CLIENT.username}`)).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled() // nothing changed yet

    await user.clear(screen.getByLabelText(/First Name/))
    await user.type(screen.getByLabelText(/First Name/), 'Kylie')
    await user.clear(screen.getByLabelText(/Phone Number/))
    await user.type(screen.getByLabelText(/Phone Number/), '+639175550000')
    await user.click(save)

    expect(await screen.findByText('Your profile was saved.')).toBeInTheDocument()
    expect(me()).toMatchObject({ firstName: 'Kylie', phoneNumber: '09175550000' })
    expect(screen.getByRole('button', { name: /Account:\s*Kylie/ })).toBeInTheDocument() // the account menu shows the new name
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

describe('Leyah\'s profile reaches the rest of the site', () => {
  const fill = async (user, label, value) => {
    const field = screen.getByLabelText(new RegExp(label))
    await user.clear(field)
    if (value) await user.type(field, value)
  }

  it('saves the salon details, and the footer, home page and social links use them', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/profile')

    await screen.findByRole('button', { name: 'Save salon details' })
    await fill(user, 'Salon phone', '+639171112222')
    await fill(user, 'GCash / Maya account name', 'Leyah D.')
    await fill(user, 'Facebook page link', 'facebook.com/nailsbyleyah.test')
    await fill(user, 'Instagram name', '@leyah.nails')
    await fill(user, 'Short bio', 'Soft gel and BIAB, done with care.')
    await user.click(screen.getByRole('button', { name: 'Save salon details' }))

    expect(await screen.findByText(/Salon details saved/)).toBeInTheDocument()
    expect(getDb().salonSettings).toMatchObject({ phone: '09171112222', facebookUrl: 'https://facebook.com/nailsbyleyah.test', instagramHandle: '@leyah.nails' })
    // Footer, on every page.
    expect(screen.getByRole('link', { name: 'Call or text 0917 111 2222' })).toHaveAttribute('href', 'tel:09171112222')
    expect(screen.getAllByRole('link', { name: /^Facebook/ })[0]).toHaveAttribute('href', 'https://facebook.com/nailsbyleyah.test')
    expect(screen.getAllByRole('link', { name: /^Instagram: @leyah\.nails/ }).length).toBeGreaterThan(0)
  })

  it('refuses a link to another site', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/profile')

    await screen.findByRole('button', { name: 'Save salon details' })
    await fill(user, 'Facebook page link', 'https://evil.example/facebook')
    await user.click(screen.getByRole('button', { name: 'Save salon details' }))

    expect(await screen.findByText('Enter your Facebook page link, starting with https://facebook.com/')).toBeInTheDocument()
  })

  it('switches an email alert off and keeps it off', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/profile')

    const alert = await screen.findByRole('switch', { name: /Client cancels/ })
    expect(alert).toBeChecked()
    await user.click(alert)
    await user.click(screen.getByRole('button', { name: 'Save salon details' }))

    expect(await screen.findByText(/Salon details saved/)).toBeInTheDocument()
    expect(getDb().salonSettings.alertCancellation).toBe(false)
    expect(getDb().salonSettings.alertNewBooking).toBe(true)
  })

  it('uploads a photo that then shows in the top bar', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/profile')

    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'me.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText('Choose a photo'), png)

    expect(await screen.findByText(/Your photo was updated/)).toBeInTheDocument()
    expect(screen.getByAltText("Leyah's photo")).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/))
    expect(document.querySelector('.nav-avatar img')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Your photo was removed.')).toBeInTheDocument()
    expect(document.querySelector('.nav-avatar img')).toBeNull()
  })

  it('changes the password only with the current one, and stays signed in', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/profile')

    await user.type(await screen.findByLabelText(/^Current password/), 'Wrong12345')
    await user.type(screen.getByLabelText(/^New password/), 'Fresh123pass')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText("That isn't your current password.")).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^Current password/))
    await user.type(screen.getByLabelText(/^Current password/), CLIENT.password)
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText(/Your password has been changed/)).toBeInTheDocument()
    expect(me().password).toBe('Fresh123pass')
    expect(screen.getByRole('heading', { name: 'My profile' })).toBeInTheDocument() // still signed in
  })
})

describe('Salon details on the home page', () => {
  it('shows the phone, and Leyah\'s photo and bio once she adds them', async () => {
    Object.assign(getDb().salonSettings, { phone: '09171112222', bio: 'Soft gel and BIAB, done with care.' })
    saveDb()
    renderApp('/')

    expect(await screen.findByText('Meet Leyah')).toBeInTheDocument()
    expect(screen.getByText('Soft gel and BIAB, done with care.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /0917 111 2222/ }).every((a) => a.getAttribute('href') === 'tel:09171112222')).toBe(true)
  })

  it('shows nothing about Leyah while the details are empty', async () => {
    renderApp('/')
    await screen.findAllByRole('link', { name: /^Facebook/ })
    expect(screen.queryByText('Meet Leyah')).toBeNull()
    expect(screen.queryByRole('link', { name: /Call or text/ })).toBeNull()
  })
})

describe('Client profile', () => {
  it('uploads a photo that shows in the top bar, and removes it', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    renderApp('/profile')

    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'me.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText('Choose a photo'), png)

    expect(await screen.findByText('Your photo was updated.')).toBeInTheDocument()
    expect(screen.getByAltText("Kyla's photo")).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/))
    expect(document.querySelector('.nav-avatar img')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Your photo was removed.')).toBeInTheDocument()
    expect(document.querySelector('.nav-avatar img')).toBeNull()
  })

  it('shows the last finished visit, and Book again opens booking with the same set chosen', async () => {
    const user = userEvent.setup()
    const db = getDb()
    const visit = db.bookings.find((b) => b.clientId === me().id && b.status === 'Completed' && !b.isDeleted)
      ?? Object.assign(db.bookings.find((b) => b.clientId === me().id && !b.isDeleted), { status: 'Completed' })
    db.bookings.filter((b) => b.clientId === me().id && b.status === 'Completed' && b.id !== visit.id).forEach((b) => { b.isDeleted = true })
    Object.assign(visit, { nailColor: '#41', bookingDate: '2026-10-01' })
    saveDb()
    await signIn(CLIENT)
    renderApp('/profile')

    const card = (await screen.findByRole('heading', { name: 'Your last visit' })).closest('.card')
    expect(await within(card).findByText('#41 – Bubblegum Pink')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out other devices' })).toBeNull() // Leyah only
    await user.click(within(card).getByRole('button', { name: 'Book again' }))

    expect(await screen.findByText(/We filled in the same set as your visit/)).toBeInTheDocument()
    const service = db.services.find((s) => s.id === visit.serviceId)
    if (service.category === 'SoftGel') expect(screen.getByRole('checkbox', { name: new RegExp(`^${service.name}`) })).toBeChecked()
  })
})
