import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ThreeMapErrorBoundaryProps {
  children: ReactNode;
  onFallback: (reason: string) => void;
}

interface ThreeMapErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches Three/R3F mount failures and asks the parent to fall back to Pixi.
 */
export class ThreeMapErrorBoundary extends Component<
  ThreeMapErrorBoundaryProps,
  ThreeMapErrorBoundaryState
> {
  state: ThreeMapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): Partial<ThreeMapErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CatanX] Échec renderer Three.js — bascule Pixi', error, info.componentStack);
    this.props.onFallback(error?.message || 'Échec d’initialisation Three.js');
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
