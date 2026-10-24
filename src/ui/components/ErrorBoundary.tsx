import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl p-6">
        <div className="panel p-5">
          <h1 className="text-lg font-semibold text-bad">Algo ha fallado</h1>
          <p className="mt-2 text-sm text-muted">Tus datos guardados no se han perdido. Puedes volver al inicio o recargar la página.</p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-night-950 p-2 text-xs text-faint">{this.state.error.message}</pre>
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg bg-night-700 px-3 py-2 text-sm" onClick={() => { window.location.hash = '/'; this.setState({ error: null }); }}>Volver al inicio</button>
            <button className="rounded-lg bg-night-700 px-3 py-2 text-sm" onClick={() => window.location.reload()}>Recargar</button>
          </div>
        </div>
      </div>
    );
  }
}
