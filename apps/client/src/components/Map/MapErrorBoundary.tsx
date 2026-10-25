import { Component, ErrorInfo, ReactNode } from 'react';

interface MapErrorBoundaryProps {
  children: ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
  message: string;
  resetKey: number;
}

export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = {
    hasError: false,
    message: '',
    resetKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<MapErrorBoundaryState> {
    return {
      hasError: true,
      message: error?.message || 'Erreur de rendu inconnue',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CatanX] Échec rendu carte', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      message: '',
      resetKey: prev.resetKey + 1,
    }));
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="ui-panel"
          style={{
            position: 'absolute',
            inset: 12,
            padding: 20,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            pointerEvents: 'auto',
          }}
        >
          <div>
            <h3 style={{ marginTop: 0 }}>Erreur de rendu de la carte</h3>
            <p style={{ maxWidth: 520, opacity: 0.85 }}>
              Le rendu Pixi a rencontré une erreur. Réessayez de remonter la scène, ou rechargez la
              page.
            </p>
            {this.state.message ? (
              <pre
                style={{
                  textAlign: 'left',
                  fontSize: 11,
                  opacity: 0.7,
                  overflow: 'auto',
                  maxHeight: 100,
                  padding: 8,
                  background: 'rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                {this.state.message}
              </pre>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button type="button" onClick={this.handleRetry}>
                Réessayer
              </button>
              <button type="button" className="command-button primary" onClick={this.handleReload}>
                Recharger
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <div key={this.state.resetKey} style={{ width: '100%', height: '100%' }}>{this.props.children}</div>;
  }
}
