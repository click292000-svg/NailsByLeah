import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, renderApp, signIn, pickDate } from './helpers'
import { getDb } from './mockBackend/db'
import { mockRequest } from './mockBackend/mockApi'
import { dateFromToday } from '../lib/dates'
import { REFERENCE_IMAGE_MESSAGES } from '../validation/rules'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])
const png = (name = 'design.png') => new File([PNG_BYTES], name, { type: 'image/png' })

// jsdom has no object URLs; the picker uses them for instant previews.
beforeAll(() => {
  URL.createObjectURL ??= () => 'blob:preview'
  URL.revokeObjectURL ??= () => {}
})

describe('Design reference photos', () => {
  async function goToDesignStep(user) {
    await user.click(await screen.findByRole('radio', { name: /With Design/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    pickDate(dateFromToday(3))
    await user.click(await screen.findByRole('button', { name: /^11:00.*Available/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
  }

  it('previews, validates and attaches photos to the booking', async () => {
    const user = userEvent.setup({ applyAccept: false })
    await signIn(CLIENT)
    renderApp('/book')
    await goToDesignStep(user)

    const input = screen.getByLabelText(/Design reference photos/)
    await user.upload(input, new File(['%PDF-1.4'], 'menu.pdf', { type: 'application/pdf' }))
    expect(screen.getByText(`menu.pdf: ${REFERENCE_IMAGE_MESSAGES.type}`)).toBeInTheDocument()

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })
    await user.upload(input, big)
    expect(screen.getByText(`huge.png: ${REFERENCE_IMAGE_MESSAGES.size}`)).toBeInTheDocument()

    await user.upload(input, png('pink-flowers.png'))
    expect(await screen.findByRole('img', { name: /Design reference 1 \(pink-flowers.png\)/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(within(screen.getByRole('list', { name: 'Design reference photos' })).getAllByRole('img')).toHaveLength(1)
    await user.click(screen.getByRole('checkbox', { name: 'I understand' }))
    await user.click(screen.getByRole('button', { name: /Pay/ }))

    expect(await screen.findByRole('heading', { name: 'Booking received!' })).toBeInTheDocument()
    const booking = getDb().bookings.at(-1)
    expect(getDb().referenceImages.filter((r) => r.bookingId === booking.id)).toHaveLength(1)
    expect(getDb().bookingDrafts.filter((d) => d.clientId === 2)).toHaveLength(0) // the draft became the booking
  })

  it('a file renamed to .png is refused because its content is not an image', async () => {
    await signIn(CLIENT)
    const fake = new File(['<script>alert(1)</script>'], 'design.png', { type: 'image/png' })
    await expect(mockRequest('POST', '/reference-images', { file: fake })).rejects.toMatchObject({ status: 400 })
  })

  it('keeps the booking, including uploaded photos, when the client leaves and comes back', async () => {
    const user = userEvent.setup()
    await signIn(CLIENT)
    const first = renderApp('/book')
    await goToDesignStep(user)
    await user.upload(screen.getByLabelText(/Design reference photos/), png('glitter.png'))
    await screen.findByRole('img', { name: /glitter.png/ })
    first.unmount()

    renderApp('/book')
    expect(await screen.findByText(/We restored the booking you saved as a draft/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /glitter.png/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/Note for Leyah/)).toBeInTheDocument() // back on the design step
  })
})

describe('Facebook and Instagram', () => {
  it('links to Leyah\'s profiles in a new tab from every page', async () => {
    renderApp('/login')
    const facebook = await screen.findByRole('link', { name: /Facebook/ })
    const instagram = screen.getByRole('link', { name: /Instagram/ })

    expect(facebook).toHaveAttribute('href', 'https://www.facebook.com/profile.php?id=61585816943665')
    expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/_franciscaleah/')
    for (const link of [facebook, instagram]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
