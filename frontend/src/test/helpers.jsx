import { fireEvent, render, screen } from '@testing-library/react'
import { formatDate } from '../lib/format'
import { MemoryRouter } from 'react-router'
import { AuthProvider, IdleLogout } from '../auth/AuthContext'
import { AppRoutes } from '../App'
import { mockRequest } from './mockBackend/mockApi'
import { demoAccounts } from './mockBackend/data/users'

export const CLIENT = demoAccounts.find((a) => a.username === 'kyla')
export const ADMIN = demoAccounts.find((a) => a.username === 'leah')

/** Signs in through the mock backend before the app renders, like returning with a valid session cookie. */
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
