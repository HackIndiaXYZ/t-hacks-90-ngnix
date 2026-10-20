import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Sakhi crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1 className="h2">Something went wrong</h1>
        <p className="muted">Sakhi hit an error. Your contacts and settings are safe on this phone.</p>
        <a className="btn sos lg block" href="tel:112">Call 112</a>
        <button className="btn primary lg block" onClick={() => location.reload()}>Reload Sakhi</button>
        <details className="muted small">
          <summary>Error details</summary>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
        </details>
      </div>
    );
  }
}
