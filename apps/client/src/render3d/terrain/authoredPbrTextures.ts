import type { TerrainType } from '@catanx/engine';
import * as THREE from 'three';
import type { TextureTier } from '../quality/renderQuality';
import { getBiomeMaterialDefinition, type TextureSet } from './BiomeMaterialRegistry';

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

function sourceForTier(set: TextureSet, tier: TextureTier): string | null {
  return set.sources[tier]
    ?? set.sources['2k']
    ?? set.sources['1k']
    ?? set.sources['512']
    ?? set.sources['4k']
    ?? null;
}

export function loadAuthoredTexture(set: TextureSet, tier: TextureTier): THREE.Texture | null {
  const source = sourceForTier(set, tier);
  if (!source) return null;
  const key = `${source}|${set.colorSpace ?? 'linear'}|${set.repeat?.join('x') ?? '1x1'}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const texture = loader.load(source);
  texture.colorSpace = set.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(set.repeat?.[0] ?? 1, set.repeat?.[1] ?? 1);
  // Terrain is always seen at a grazing angle, which is exactly the case
  // anisotropic filtering exists for. three clamps this to the driver maximum.
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

export function getAuthoredBiomeAlbedo(
  terrain: TerrainType,
  tier: TextureTier,
): THREE.Texture | null {
  const definition = getBiomeMaterialDefinition(terrain);
  return definition.albedo ? loadAuthoredTexture(definition.albedo, tier) : null;
}

export interface AuthoredBiomeTextures {
  albedo: THREE.Texture | null;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  ao: THREE.Texture | null;
  height: THREE.Texture | null;
}

export function getAuthoredBiomeTextures(
  terrain: TerrainType,
  tier: TextureTier,
): AuthoredBiomeTextures {
  const definition = getBiomeMaterialDefinition(terrain);
  const ao = definition.ao ? loadAuthoredTexture(definition.ao, tier) : null;
  if (ao) ao.channel = 0;
  return {
    albedo: definition.albedo ? loadAuthoredTexture(definition.albedo, tier) : null,
    normal: definition.normal ? loadAuthoredTexture(definition.normal, tier) : null,
    roughness: definition.roughnessMap ? loadAuthoredTexture(definition.roughnessMap, tier) : null,
    ao,
    height: definition.height ? loadAuthoredTexture(definition.height, tier) : null,
  };
}
