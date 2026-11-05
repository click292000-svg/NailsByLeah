import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../components/ErrorBoundary'

function Broken() {
  throw new Error('display problem')
}

describe('Crash screen', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {})) // React logs the caught error
  afterEach(() => vi.restoreAllMocks())

  it('shows a message and a reload button instead of a blank page', () => {
    render(<ErrorBoundary><Broken /></ErrorBoundary>)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
    expect(screen.queryByText('display problem')).toBeNull()
  })

  it('shows the page normally when nothing is wrong', () => {
    render(<ErrorBoundary><p>Everything is fine</p></ErrorBoundary>)

    expect(screen.getByText('Everything is fine')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
