import type { TerrainType } from '@catanx/engine';
import * as THREE from 'three';
import type { TextureTier } from '../quality/renderQuality';
import { hashString } from '../utils/seededVisualRandom';

export interface ProceduralPbrTextureSet {
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
}

const cache = new Map<string, ProceduralPbrTextureSet>();

const FALLBACK_RESOLUTION: Record<TextureTier, number> = {
  '512': 32,
  '1k': 48,
  '2k': 64,
  '4k': 96,
};

function periodicHeight(x: number, y: number, seed: number): number {
  const phase = (seed % 997) / 997 * Math.PI * 2;
  return (
    Math.sin(x * Math.PI * 2 + phase) * 0.44 +
    Math.sin(y * Math.PI * 4 - phase * 0.73) * 0.27 +
    Math.sin((x + y) * Math.PI * 6 + phase * 1.41) * 0.18 +
    Math.sin((x * 2 - y) * Math.PI * 8 - phase) * 0.11
  );
}

function makeTexture(data: Uint8Array, size: number, colorSpace: THREE.ColorSpace) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 3.5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Small deterministic PBR fallback. It adds micro-normal and roughness breakup
 * while authored KTX2 sets are streamed in later; it is not a replacement for
 * the source asset pipeline.
 */
export function getProceduralPbrTextures(
  terrain: TerrainType,
  tier: TextureTier,
): ProceduralPbrTextureSet {
  const key = `${terrain}:${tier}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const size = FALLBACK_RESOLUTION[tier];
  const seed = hashString(`pbr:${terrain}`);
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const step = 1 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const h = periodicHeight(u, v, seed);
      const hx = periodicHeight((u + step) % 1, v, seed) - periodicHeight((u - step + 1) % 1, v, seed);
      const hy = periodicHeight(u, (v + step) % 1, seed) - periodicHeight(u, (v - step + 1) % 1, seed);
      const vector = new THREE.Vector3(-hx * 1.8, -hy * 1.8, 1).normalize();
      const i = (y * size + x) * 4;
      const tone = Math.max(205, Math.min(255, Math.round(235 + h * 13)));
      albedo[i] = tone;
      albedo[i + 1] = tone;
      albedo[i + 2] = tone;
      albedo[i + 3] = 255;
      normal[i] = Math.round((vector.x * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((vector.y * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((vector.z * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
      const rough = Math.max(178, Math.min(255, Math.round(226 - h * 18)));
      roughness[i] = rough;
      roughness[i + 1] = rough;
      roughness[i + 2] = rough;
      roughness[i + 3] = 255;
    }
  }

  const result = {
    albedo: makeTexture(albedo, size, THREE.SRGBColorSpace),
    normal: makeTexture(normal, size, THREE.NoColorSpace),
    roughness: makeTexture(roughness, size, THREE.NoColorSpace),
  };
  cache.set(key, result);
  return result;
}

export function clearProceduralPbrTextureCache(): void {
  for (const set of cache.values()) {
    set.albedo.dispose();
    set.normal.dispose();
    set.roughness.dispose();
  }
  cache.clear();
}
