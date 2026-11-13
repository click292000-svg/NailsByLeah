import { fireEvent, render, screen, within } from '@testing-library/react'
import { formatDate } from '../lib/format'
import { MemoryRouter } from 'react-router'
import { AuthProvider, IdleLogout } from '../auth/AuthContext'
import { AppRoutes } from '../App'
import { SalonProvider } from '../components/SalonProfile'
import { mockRequest } from './mockBackend/mockApi'
import { demoAccounts } from './mockBackend/data/users'

export const CLIENT = demoAccounts.find((a) => a.username === 'kyla')
export const ADMIN = demoAccounts.find((a) => a.username === 'leah')

/** Signs in through the mock backend before the app renders, like returning with a valid session cookie. */
/** Opens the Terms from the payment step, reads to the end (all of it fits in the test page), closes it, and agrees. */
/** Opens the colour chart, picks shade #NN and confirms it with Use This Color. */
export async function pickShade(user, number) {
  await user.click(screen.getByRole('button', { name: /Open the colour chart|Change colour/ }))
  const chart = screen.getByRole('dialog', { name: 'Choose Nail Color' })
  await user.click(within(chart).getByRole('radio', { name: new RegExp(`^Shade #${number},`) }))
  await user.click(within(chart).getByRole('button', { name: 'Use This Color' }))
}

/** Opens the Terms from the payment step (not the footer link), agrees in its window and closes it. */
export const openPaymentTerms = (user) =>
  user.click(screen.getAllByRole('button', { name: 'Terms & Conditions' }).find((b) => b.closest('.payment-panel')))

/** Picks the deposit and GCash where nothing is chosen yet (the payment step starts with nothing picked), then agrees. */
export async function readTermsAndAgree(user) {
  const option = screen.queryAllByRole('radio', { name: /^(Booking deposit|Full payment)$/ })
  if (option.length && !option.some((r) => r.checked)) await user.click(screen.getByRole('radio', { name: 'Booking deposit' }))
  const method = screen.queryAllByRole('radio', { name: /^(GCash|Maya)$/ })
  if (method.length && !method.some((r) => r.checked)) await user.click(screen.getByRole('radio', { name: 'GCash' }))
  await openPaymentTerms(user)
  const dialog = screen.getByRole('dialog', { name: 'Terms & Conditions' })
  await user.click(within(dialog).getByRole('checkbox', { name: 'I have read and agree to the Terms & Conditions.' }))
  await user.click(within(dialog).getByRole('button', { name: 'Agree and continue' }))
}

export const signIn = (account) => mockRequest('POST', '/auth/login', { body: { usernameOrEmail: account.username, password: account.password } })

/** Renders the whole app at `route`. */
export function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <SalonProvider>
          <IdleLogout />
          <AppRoutes />
        </SalonProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** Chooses a day in the booking calendar (named by its full date), turning to next month if the day falls there. */
export const pickDate = (isoDate) => {
  const name = formatDate(isoDate)
  if (!screen.queryByRole('radio', { name })) fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  fireEvent.click(screen.getByRole('radio', { name }))
}
