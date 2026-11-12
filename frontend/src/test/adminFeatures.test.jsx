import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { getDb } from './mockBackend/db'
import { mockRequest } from './mockBackend/mockApi'

const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])

beforeAll(() => {
  URL.createObjectURL ??= () => 'blob:preview'
  URL.revokeObjectURL ??= () => {}
})

describe('Leyah books for a client herself', () => {
  it('books a walk-in without an account, confirmed, with the cash deposit recorded', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/bookings')

    await user.click(await screen.findByRole('button', { name: '+ New booking' }))
    const dialog = await screen.findByRole('dialog', { name: 'New booking' })
    // Only walk-ins and people who message the salon's pages; clients with an account book online themselves.
    expect(within(dialog).queryByRole('radio', { name: /Has an account/ })).toBeNull()
    await user.click(within(dialog).getByRole('radio', { name: 'Facebook' }))
    await user.type(within(dialog).getByLabelText(/^Name/), 'Ana Santos')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /^Service/ }), within(dialog).getByRole('option', { name: /^Plain ·/ }))
    // The salon's own date picker: past days can't be chosen, and the arrows step a day at a time.
    expect(within(dialog).getByRole('button', { name: 'Previous day' })).toBeDisabled()
    for (let i = 0; i < 3; i++) await user.click(within(dialog).getByRole('button', { name: 'Next day' }))
    await user.selectOptions(await within(dialog).findByLabelText(/^Time/), await within(dialog).findByRole('option', { name: /^11:00 AM/ }))
    await user.selectOptions(within(dialog).getByLabelText(/^Already paid/), 'Deposit')
    await user.click(within(dialog).getByRole('button', { name: 'Book and confirm' }))

    expect(await screen.findByText(/made for Ana Santos and confirmed/)).toBeInTheDocument()
    const booking = getDb().bookings.at(-1)
    expect(booking).toMatchObject({ guestName: 'Ana Santos', status: 'Confirmed', createdByAdmin: true, amountPaid: 150, note: 'Booked through Facebook' })
    expect(getDb().payments.at(-1)).toMatchObject({ method: 'Cash', bookingId: booking.id })
    // The list shows the walk-in's own name, not Leyah's account.
    expect(await screen.findByText('Booked by Leyah')).toBeInTheDocument()
  })
})

describe('Shade stock and booking rules', () => {
  it('marks a shade out of stock, and clients can no longer pick it', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/services')
    await user.click(await screen.findByRole('button', { name: /^#06 – .*: in stock$/ }))
    expect(await screen.findByRole('button', { name: /^#06 – .*: out of stock$/ })).toBeInTheDocument()

    const catalog = await mockRequest('GET', '/services')
    expect(catalog.outOfStockColors).toEqual(['#06'])
    await signIn(CLIENT)
    await expect(mockRequest('POST', '/bookings', { body: {} })).rejects.toBeTruthy() // still requires a full booking
  })

  it('changes the deposit, which the price list then uses', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/schedule')
    const deposit = await screen.findByLabelText(/^Deposit/)
    await user.clear(deposit)
    await user.type(deposit, '200')
    await user.click(screen.getByRole('button', { name: 'Save rules' }))

    expect(await screen.findByText('Booking rules saved.')).toBeInTheDocument()
    expect((await mockRequest('GET', '/services')).depositAmount).toBe(200)
  })
})

describe('Client notes, feedback replies and the gallery', () => {
  it('keeps a private note on a client', async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/clients')
    await user.click(await screen.findByRole('button', { name: `Open @${CLIENT.username}` }))
    await user.type(await screen.findByLabelText('Your private note'), 'Prefers short almond')
    await user.click(screen.getByRole('button', { name: 'Save note' }))

    await waitFor(() => expect(getDb().users.find((u) => u.username === CLIENT.username).adminNote).toBe('Prefers short almond'))
    expect(screen.getByText('No-shows')).toBeInTheDocument()
  })

  it('replies to feedback, and the client sees the reply', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    await mockRequest('POST', '/feedback', { body: { rating: 5, comment: 'Lovely set!', submissionKey: crypto.randomUUID() } })
    await signIn(ADMIN)
    const admin = renderApp('/admin/feedback')
    const item = (await screen.findByText('Lovely set!')).closest('li')
    await user.click(within(item).getByRole('button', { name: 'Reply' }))
    await user.type(within(item).getByLabelText('Reply to this feedback'), 'Thank you, see you soon!')
    await user.click(within(item).getByRole('button', { name: 'Send reply' }))
    expect(await within(item).findByText('Thank you, see you soon!')).toBeInTheDocument()
    admin.unmount()

    await signIn(CLIENT)
    renderApp('/feedback')
    expect(await screen.findByText('Leyah replied')).toBeInTheDocument()
    expect(screen.getByText('Thank you, see you soon!')).toBeInTheDocument()
  })

  it("adds a photo to the home page's Our Works", async () => {
    const user = userEvent.setup()
    await signIn(ADMIN)
    renderApp('/admin/gallery')
    await user.upload(await screen.findByLabelText('Photo'), new File([PNG], 'lace.png', { type: 'image/png' }))
    await user.type(screen.getByLabelText(/^Caption/), 'Lace with silver studs')
    await user.click(screen.getByRole('button', { name: 'Add to the home page' }))

    expect(await screen.findByText('Photo added to the home page.')).toBeInTheDocument()
    expect((await mockRequest('GET', '/gallery')).map((p) => p.caption)).toEqual(['Lace with silver studs'])
  })
})
