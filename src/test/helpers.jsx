import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AuthProvider, IdleLogout } from '../auth/AuthContext'
import { AppRoutes } from '../App'
import { mockRequest } from '../mock/mockApi'
import { demoAccounts } from '../mock/data/users'

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
