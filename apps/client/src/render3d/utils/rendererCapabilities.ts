export interface RendererCapabilities {
  webgl2: boolean;
  /** Capability only: production activation remains gated by parity tests. */
  webgpu: boolean;
  reason: string | null;
}

let cached: RendererCapabilities | null = null;

/** Detect GPU backends without creating the production renderer. */
export function detectRendererCapabilities(): RendererCapabilities {
  if (cached) return cached;
  if (typeof document === 'undefined') {
    cached = { webgl2: false, webgpu: false, reason: 'Environnement sans DOM' };
    return cached;
  }

  try {
    const canvas = document.createElement('canvas');
    const webgl2 = Boolean(canvas.getContext('webgl2'));
    const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    cached = {
      webgl2,
      webgpu,
      reason: webgl2 ? null : 'WebGL 2 non disponible',
    };
  } catch {
    cached = {
      webgl2: false,
      webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
      reason: 'Échec d’initialisation WebGL 2',
    };
  }
  return cached;
}

export function supportsWebGL2(): boolean {
  return detectRendererCapabilities().webgl2;
}

export function supportsWebGPU(): boolean {
  return detectRendererCapabilities().webgpu;
}

/** Test helper: clear capability cache. */
export function resetRendererCapabilitiesCache(): void {
  cached = null;
}
