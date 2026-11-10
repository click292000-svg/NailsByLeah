import { fireEvent, render, screen, within } from '@testing-library/react'
import { formatDate } from '../lib/format'
import { MemoryRouter } from 'react-router'
import { AuthProvider, IdleLogout } from '../auth/AuthContext'
import { AppRoutes } from '../App'
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

export async function readTermsAndAgree(user) {
  await user.click(screen.getByRole('button', { name: /Review booking policies/ }))
  await user.click(within(screen.getByRole('dialog', { name: 'Terms & Conditions' })).getByRole('button', { name: 'Done' }))
  await user.click(screen.getByRole('checkbox', { name: /I have read and agree to the booking policies/ }))
}

export const signIn = (account) => mockRequest('POST', '/auth/login', { body: { usernameOrEmail: account.username, password: account.password } })

/** Renders the whole app at `route`. */
export function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <IdleLogout />
        <AppRoutes />
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
