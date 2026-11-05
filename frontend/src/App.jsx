import { Link, Route, Routes } from 'react-router'
import { AuthProvider, IdleLogout } from './auth/AuthContext'
import { GuestOnly, RequireRole } from './auth/RouteGuards'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './pages/auth/PasswordPages'
import HomePage from './pages/client/HomePage'
import BookPage from './pages/client/BookPage'
import MyBookingsPage from './pages/client/MyBookingsPage'
import DashboardPage from './pages/admin/DashboardPage'
import BookingsPage from './pages/admin/BookingsPage'
import ServicesPage from './pages/admin/ServicesPage'
import SchedulePage from './pages/admin/SchedulePage'
import ReportsPage from './pages/admin/ReportsPage'
import ClientDataPage from './pages/admin/ClientDataPage'
import ActivityLogPage from './pages/admin/ActivityLogPage'
import AdminFeedbackPage from './pages/admin/FeedbackPage'
import FeedbackPage from './pages/client/FeedbackPage'

const client = (page) => <RequireRole role="Client">{page}</RequireRole>
const admin = (page) => <RequireRole role="Administrator">{page}</RequireRole>
const guest = (page) => <GuestOnly>{page}</GuestOnly>

/** Routes. Client-only and administrator-only pages are guarded by role (Ref 8.7). */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={guest(<RegisterPage />)} />
        <Route path="verify-email" element={guest(<VerifyEmailPage />)} />
        <Route path="forgot-password" element={guest(<ForgotPasswordPage />)} />
        <Route path="reset-password" element={guest(<ResetPasswordPage />)} />

        <Route path="book" element={client(<BookPage />)} />
        <Route path="bookings" element={client(<MyBookingsPage />)} />
        <Route path="feedback" element={client(<FeedbackPage />)} />

        <Route path="admin" element={admin(<DashboardPage />)} />
        <Route path="admin/bookings" element={admin(<BookingsPage />)} />
        <Route path="admin/services" element={admin(<ServicesPage />)} />
        <Route path="admin/schedule" element={admin(<SchedulePage />)} />
        <Route path="admin/reports" element={admin(<ReportsPage />)} />
        <Route path="admin/feedback" element={admin(<AdminFeedbackPage />)} />
        <Route path="admin/activity" element={admin(<ActivityLogPage />)} />
        <Route path="admin/clients" element={admin(<ClientDataPage />)} />

        <Route path="*" element={<EmptyState title="Page not found"><Link to="/">Go to the home page</Link></EmptyState>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <IdleLogout />
      <AppRoutes />
    </AuthProvider>
  )
}
