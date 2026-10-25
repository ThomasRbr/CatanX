import type { GraphicsBackend, VisualQuality } from '../../store/settingsTypes';

export type ConcreteVisualQuality = Exclude<VisualQuality, 'auto'>;
export type TextureTier = '512' | '1k' | '2k' | '4k';
export type WaterQuality = 'simple' | 'standard' | 'advanced';

export interface RenderQualityProfile {
  id: ConcreteVisualQuality;
  backend: GraphicsBackend;
  maxDpr: number;
  textureTier: TextureTier;
  shadowSize: 1024 | 2048 | 4096;
  terrainChunkResolution: number;
  shadowCascades: number;
  vegetationDensity: number;
  waterQuality: WaterQuality;
  contactShadows: boolean;
  indirectLighting: boolean;
  cinematicDepthOfField: boolean;
  atmosphericFx: boolean;
  maxVisibleTriangles: number;
  drawCallBudget: number;
  vramBudgetMb: number;
}

export interface GraphicsCapabilities {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  devicePixelRatio?: number;
  /** WebGL UNMASKED_RENDERER string, when the browser exposes it. */
  gpuRenderer?: string;
}

/**
 * Integrated and mobile GPUs. CPU cores and memory say nothing about the GPU:
 * a 16-thread laptop running on its Intel UHD was picked as Ultra and ran the
 * full board at half the frame rate of the Balanced tier.
 */
export const INTEGRATED_GPU_PATTERN =
  /intel|uhd|iris|mali|adreno|powervr|apple gpu|radeon\(tm\) graphics|vega \d+ graphics|swiftshader|llvmpipe/i;

export function isIntegratedGpu(renderer: string | undefined | null): boolean {
  return !!renderer && INTEGRATED_GPU_PATTERN.test(renderer);
}

export const RENDER_QUALITY_PROFILES: Record<ConcreteVisualQuality, RenderQualityProfile> = {
  low: {
    id: 'low', backend: 'webgl2', maxDpr: 1, textureTier: '512', shadowSize: 1024,
    terrainChunkResolution: 24, shadowCascades: 1,
    vegetationDensity: 0.4, waterQuality: 'simple', contactShadows: false,
    indirectLighting: false, cinematicDepthOfField: false,
    atmosphericFx: false, maxVisibleTriangles: 600_000, drawCallBudget: 180,
    vramBudgetMb: 1_500,
  },
  balanced: {
    id: 'balanced', backend: 'webgl2', maxDpr: 1.25, textureTier: '1k', shadowSize: 2048,
    terrainChunkResolution: 48, shadowCascades: 2,
    vegetationDensity: 0.75, waterQuality: 'standard', contactShadows: true,
    indirectLighting: true, cinematicDepthOfField: false,
    atmosphericFx: true, maxVisibleTriangles: 6_000_000, drawCallBudget: 250,
    vramBudgetMb: 3_072,
  },
  high: {
    id: 'high', backend: 'auto', maxDpr: 1.75, textureTier: '2k', shadowSize: 2048,
    terrainChunkResolution: 72, shadowCascades: 3,
    vegetationDensity: 1.25, waterQuality: 'advanced', contactShadows: true,
    indirectLighting: true, cinematicDepthOfField: true,
    atmosphericFx: true, maxVisibleTriangles: 10_000_000, drawCallBudget: 350,
    vramBudgetMb: 4_608,
  },
  ultra: {
    id: 'ultra', backend: 'auto', maxDpr: 2, textureTier: '4k', shadowSize: 2048,
    terrainChunkResolution: 96, shadowCascades: 4,
    vegetationDensity: 1.35, waterQuality: 'advanced', contactShadows: true,
    indirectLighting: true, cinematicDepthOfField: true,
    atmosphericFx: true, maxVisibleTriangles: 12_000_000, drawCallBudget: 400,
    vramBudgetMb: 5_120,
  },
};

/** Pure and testable auto-tier selection; unknown hardware stays conservative. */
export function resolveAutoVisualQuality(capabilities: GraphicsCapabilities): ConcreteVisualQuality {
  const memory = capabilities.deviceMemoryGb ?? 4;
  const cores = capabilities.hardwareConcurrency ?? 4;
  const dpr = capabilities.devicePixelRatio ?? 1;
  if (memory <= 2 || cores <= 2) return 'low';
  if (isIntegratedGpu(capabilities.gpuRenderer)) return 'balanced';
  if (memory >= 12 && cores >= 10 && dpr <= 2.5) return 'ultra';
  if (memory >= 8 && cores >= 8) return 'high';
  return 'balanced';
}

export function browserGraphicsCapabilities(): GraphicsCapabilities {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    gpuRenderer: probeGpuRenderer(),
  };
}

let cachedGpuRenderer: string | undefined | null = null;

function probeGpuRenderer(): string | undefined {
  if (cachedGpuRenderer !== null) return cachedGpuRenderer;
  cachedGpuRenderer = undefined;
  if (typeof document === 'undefined') return undefined;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return undefined;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    cachedGpuRenderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cachedGpuRenderer = undefined;
  }
  return cachedGpuRenderer;
}

export function resolveRenderQualityProfile(
  requested: VisualQuality,
  capabilities: GraphicsCapabilities = browserGraphicsCapabilities(),
  backendOverride: GraphicsBackend = 'auto',
): RenderQualityProfile {
  const tier = requested === 'auto' ? resolveAutoVisualQuality(capabilities) : requested;
  const profile = RENDER_QUALITY_PROFILES[tier];
  return backendOverride === 'auto' ? profile : { ...profile, backend: backendOverride };
}

export function dprRangeForProfile(
  profile: RenderQualityProfile,
  options?: { capture?: boolean },
): [number, number] {
  // High-end profiles supersample even on a 1x desktop display. Otherwise an
  // Ultra capture has the same edge resolution as Balanced and the additional
  // texture/shadow detail is lost before presentation.
  if (options?.capture && profile.id === 'ultra') {
    return [1.5, 2];
  }
  if (options?.capture && profile.id === 'high') {
    return [1.25, 1.75];
  }
  // Interactive Ultra: keep 4k materials / 2k shadows — framebuffer
  // supersampling was the silent FPS killer (~12 → ~30).
  const minimum = profile.id === 'ultra' ? 1 : profile.id === 'high' ? 1.25 : 1;
  const maximum = profile.id === 'ultra' ? 1.25 : profile.maxDpr;
  return [Math.min(minimum, maximum), maximum];
}
