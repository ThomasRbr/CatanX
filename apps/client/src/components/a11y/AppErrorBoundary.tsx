import { Component, ErrorInfo, ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
  resetKey: number;
}

/**
 * Filet de sécurité racine (Phase 7).
 * Capture les erreurs React non gérées hors de la carte Pixi.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
    resetKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      message: error?.message || 'Erreur inattendue',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CatanX] Erreur application', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState((prev) => ({
      hasError: false,
      message: '',
      resetKey: prev.resetKey + 1,
    }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            background: 'linear-gradient(135deg, #3f4b42 0%, #2c3530 100%)',
          }}
        >
          <div className="ui-panel" style={{ maxWidth: 520, padding: 22, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0 }}>Une erreur est survenue</h2>
            <p style={{ opacity: 0.85, lineHeight: 1.45 }}>
              L’interface a rencontré un problème. Vous pouvez réessayer ou recharger la page. Votre
              sauvegarde locale reste disponible depuis le menu.
            </p>
            {this.state.message ? (
              <pre
                style={{
                  textAlign: 'left',
                  fontSize: 11,
                  opacity: 0.7,
                  overflow: 'auto',
                  maxHeight: 120,
                  padding: 8,
                  background: 'rgba(0,0,0,0.08)',
                  borderRadius: 8,
                }}
              >
                {this.state.message}
              </pre>
            ) : null}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button type="button" onClick={this.handleReset}>
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

    return (
      <div key={this.state.resetKey} className="app-root" style={{ width: '100%', height: '100%' }}>
        {this.props.children}
      </div>
    );
  }
}
