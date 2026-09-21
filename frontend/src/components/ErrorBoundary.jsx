import { Component } from 'react'

/** Renders `fallback` when a child throws (used around the WebGL canvas). */
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.warn('[ErrorBoundary]', error)
  }

  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children
  }
}
