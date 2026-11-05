import { Component } from 'react'
import { Button, EmptyState } from './ui'

/** Shows a friendly message instead of a blank page when a page fails to display. */
export class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="error-screen">
        <EmptyState title="Something went wrong">This page couldn't be shown. Please reload it. If it keeps happening, contact the salon.</EmptyState>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
      </div>
    )
  }
}
