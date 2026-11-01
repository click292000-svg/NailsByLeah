import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CLIENT, renderApp } from './helpers'
import { getDb } from '../mock/db'

describe('Registration', () => {
  it('shows "Username is already taken." for an existing username (7.4)', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.type(await screen.findByLabelText(/^Username/), CLIENT.username)

    expect(await screen.findByText('Username is already taken.')).toBeInTheDocument()
  })

  it('keeps Create account disabled until the Terms & Conditions are accepted', async () => {
    const user = userEvent.setup()
    renderApp('/register')
    const submit = await screen.findByRole('button', { name: 'Create account' })

    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
  })

  it('opens the Terms & Conditions and Privacy Policy in scrollable windows', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.click(await screen.findByRole('button', { name: 'Terms & Conditions' }))
    expect(screen.getByRole('dialog', { name: 'Terms & Conditions' })).toBeInTheDocument()
    expect(screen.getByLabelText('Terms & Conditions text')).toHaveClass('legal-scroll')
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0])

    await user.click(screen.getByRole('button', { name: 'Privacy Policy' }))
    expect(screen.getByRole('dialog', { name: 'Privacy Policy' })).toBeInTheDocument()
  })

  it('registers, then verifies the email with the code from the inbox', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.type(await screen.findByLabelText(/First Name/), 'Bea')
    await user.type(screen.getByLabelText(/Last Name/), 'Torres')
    await user.type(screen.getByLabelText(/^Username/), 'bea.torres')
    await user.type(screen.getByLabelText(/Email address/), 'bea@example.test')
    await user.type(screen.getByLabelText(/Phone Number/), '09223334444')
    await user.type(screen.getByLabelText(/^Password( \*)?$/), 'BeaPass123')
    await user.type(screen.getByLabelText(/Confirm Password/), 'BeaPass123')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
    const code = getDb().outbox.find((e) => e.to === 'bea@example.test').code
    await user.type(screen.getByLabelText(/Verification code/), code)
    await user.click(screen.getByRole('button', { name: 'Verify email' }))

    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument()
  })
})

describe('Reset Password page (7.5)', () => {
  it('says so straight away when the link has expired', async () => {
    renderApp('/reset-password?token=expired-demo-token')
    expect(await screen.findByText('This link has expired')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument()
  })

  it('says so when the link was already used', async () => {
    renderApp('/reset-password?token=used-demo-token')
    expect(await screen.findByText('This link cannot be used')).toBeInTheDocument()
  })

  it('changes the password with a fresh link from Forgot Password', async () => {
    const user = userEvent.setup()
    renderApp('/forgot-password')
    await user.type(await screen.findByLabelText(/Email address/), 'kyla@example.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    await screen.findByText(/a password reset link has been sent/)

    const link = new URL(getDb().outbox.find((e) => e.link).link)
    renderApp(link.pathname + link.search)
    await user.type(await screen.findByLabelText(/^New password/), 'NewSecret123')
    await user.type(screen.getByLabelText(/Confirm new password/), 'NewSecret123')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText(/Your password has been changed/)).toBeInTheDocument()
  })
})

describe('Login', () => {
  it('shows the lockout message after five failed attempts (Ref 8.3)', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText(/Username or email/), CLIENT.username)
    const password = screen.getByLabelText(/^Password( \*)?$/)
    const submit = screen.getByRole('button', { name: 'Log in' })

    for (let attempt = 1; attempt <= 5; attempt++) {
      await user.clear(password)
      await user.type(password, `Wrong${attempt}pass`)
      await user.click(submit)
      await waitFor(() => expect(submit).toBeEnabled())
    }

    expect(await screen.findByText('Account locked')).toBeInTheDocument()
    expect(screen.getByText(/try again in 15 minutes/)).toBeInTheDocument()
  })

  it('sends a client to their bookings after logging in', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText(/Username or email/), CLIENT.username)
    await user.type(screen.getByLabelText(/^Password( \*)?$/), CLIENT.password)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()
  })
})
