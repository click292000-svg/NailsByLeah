import { act, screen } from '@testing-library/react'
import { ADMIN, CLIENT, renderApp, signIn } from './helpers'
import { mockRequest } from './mockBackend/mockApi'
import { getDb } from './mockBackend/db'

describe('Route guards (7.10)', () => {
  it('sends a client who opens an admin page to their bookings with a message', async () => {
    await signIn(CLIENT)
    renderApp('/admin/services')

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()
    expect(screen.getByText(/You don't have access to that page/)).toBeInTheDocument()
  })

  it('sends an administrator who opens a client page to the dashboard', async () => {
    await signIn(ADMIN)
    renderApp('/book')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText(/You don't have access to that page/)).toBeInTheDocument()
  })

  it('sends signed-out visitors to the login page', async () => {
    renderApp('/bookings')
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('does not send someone back to the other role\'s page after logging in', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()
    renderApp('/book') // signed out → login page, remembering /book
    await user.type(await screen.findByLabelText(/Username or email/), ADMIN.username)
    await user.type(screen.getByLabelText(/^Password/), ADMIN.password)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByText(/You don't have access to that page/)).not.toBeInTheDocument()
  })

  it('is backed by the API refusing the wrong role', async () => {
    await signIn(CLIENT)
    await expect(mockRequest('GET', '/admin/dashboard')).rejects.toMatchObject({ status: 403 })
  })
})

describe('Cross-site scripting (7.9)', () => {
  it('shows a name containing a script tag as plain text', async () => {
    const script = '<script>alert(1)</script>'
    Object.assign(getDb().users.find((u) => u.username === 'maria.dc'), { firstName: script })
    await signIn(ADMIN)
    const { container } = renderApp('/admin/bookings?clientName=Dela')

    expect((await screen.findAllByText(new RegExp(script.replace(/[()]/g, '\\$&')))).length).toBeGreaterThan(0)
    expect(container.querySelector('script')).toBeNull()
  })
})

describe('Inactivity logout (Ref 8.4)', () => {
  afterEach(() => vi.useRealTimers())

  it('logs out after 30 idle minutes and explains why on the login page', async () => {
    await signIn(CLIENT)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderApp('/bookings')
    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(30 * 60_000 + 1000)
    })

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByText(/logged out after 30 minutes of inactivity/)).toBeInTheDocument()
  })
})
