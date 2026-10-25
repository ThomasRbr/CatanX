import type { Season, TerrainType } from '@catanx/engine';
import type { TextureTier } from '../quality/renderQuality';

export interface TextureSet {
  sources: Partial<Record<TextureTier, string>>;
  colorSpace?: 'srgb' | 'linear';
  repeat?: readonly [number, number];
}

export interface SeasonalMaterialOverride {
  color?: string;
  roughnessDelta?: number;
  clearcoat?: number;
}

export interface ClimateMaterialOverride extends SeasonalMaterialOverride {
  wetness?: number;
  snow?: number;
  dust?: number;
}

export interface BiomeMaterialDefinition {
  id: TerrainType;
  albedo?: TextureSet;
  normal?: TextureSet;
  roughnessMap?: TextureSet;
  ao?: TextureSet;
  height?: TextureSet;
  fallbackColor: string;
  /** Neutral multiplier used to art-direct authored albedo without replacing it. */
  albedoTint?: string;
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  seasonalVariants?: Partial<Record<Season, SeasonalMaterialOverride>>;
  climateOverrides?: Record<string, ClimateMaterialOverride>;
}

const DEFAULT: Omit<BiomeMaterialDefinition, 'id' | 'fallbackColor'> = {
  roughness: 0.88,
  metalness: 0.01,
  envMapIntensity: 0.58,
};

/**
 * Terrain maps are produced by `tools/build_terrain_pbr.py` as WebP. Sets built
 * from a Poly Haven photoscan additionally expose the untouched 4K originals on
 * the `4k` tier.
 */
function authoredMap(
  stem: string,
  channel: 'albedo' | 'normal' | 'roughness' | 'ao',
  repeat: readonly [number, number],
  version: string,
): TextureSet {
  const source = `/assets/textures/terrain/photoreal/${stem}_${channel}_${version}.webp`;
  return {
    sources: { '512': source, '1k': source, '2k': source, '4k': source },
    colorSpace: channel === 'albedo' ? 'srgb' : 'linear',
    repeat,
  };
}

function authoredPbr(stem: string, repeat: readonly [number, number], version: string) {
  return {
    albedo: authoredMap(stem, 'albedo', repeat, version),
    normal: authoredMap(stem, 'normal', repeat, version),
    roughnessMap: authoredMap(stem, 'roughness', repeat, version),
    ao: authoredMap(stem, 'ao', repeat, version),
  } as const;
}

function authoredPbrWithPolyHavenUltra(
  stem: string,
  repeat: readonly [number, number],
  version: string,
  polyHavenAssetId: string,
) {
  const base = authoredPbr(stem, repeat, version);
  const ultra = (set: TextureSet, channel: 'diff' | 'nor_gl' | 'rough' | 'ao'): TextureSet => ({
    ...set,
    sources: {
      ...set.sources,
      '4k': `/assets/textures/terrain/photoreal/polyhaven/${polyHavenAssetId}_${channel}_4k.jpg`,
    },
  });
  return {
    albedo: ultra(base.albedo, 'diff'),
    normal: ultra(base.normal, 'nor_gl'),
    roughnessMap: ultra(base.roughnessMap, 'rough'),
    ao: ultra(base.ao, 'ao'),
  } as const;
}

// v4 sets are downscaled from the vendored 4K Poly Haven photoscans and carry
// that scan's own normal / roughness / AO. The previous v3 sets were 1254px
// sources upscaled to 2048 with normals guessed from albedo luminance.
const PBR_MEADOW = authoredPbrWithPolyHavenUltra('meadow_lush_scan', [1.9, 1.9], 'v4', 'leafy_grass');
const PBR_FOREST_FLOOR = authoredPbrWithPolyHavenUltra('forest_floor_scan', [1.82, 1.82], 'v4', 'forrest_ground_03');
const PBR_RED_CLAY = authoredPbrWithPolyHavenUltra('ochre_clay_scan', [1.86, 1.86], 'v4', 'red_mud_stones');
const PBR_DUNE_SAND = authoredPbrWithPolyHavenUltra('warm_dune_scan', [1.92, 1.92], 'v4', 'sand_01');
// No photoscan exists for these two, so they stay derived — but from the
// sharpest source at its native resolution rather than an upscale. v5 rock is
// built from the *fractured* alpine source; the slab it replaced is what made
// mountains read as poured concrete.
const PBR_ALPINE_ROCK = authoredPbr('alpine_strata_scan', [1.46, 1.46], 'v5');
// Rows are sampled in world space by the continuous terrain shader. They give
// plains agricultural direction and micro-relief without introducing a second
// mesh, hard decal border, or visible hex-shaped crop island.
const PBR_WHEAT = authoredPbr('wheat_rows', [1.35, 1.35], 'v2');

function biome(
  id: TerrainType,
  fallbackColor: string,
  values: Partial<Omit<BiomeMaterialDefinition, 'id' | 'fallbackColor'>> = {},
): BiomeMaterialDefinition {
  return { ...DEFAULT, id, fallbackColor, ...values };
}

/**
 * PBR source of truth. Texture slots are optional so the deterministic painted
 * geometry remains a graceful fallback while KTX2 sets are produced.
 */
export const BIOME_MATERIALS: Record<TerrainType, BiomeMaterialDefinition> = {
  plains: biome('plains', '#a88743', { ...PBR_WHEAT, albedoTint: '#d0c2a1', roughness: 0.91 }),
  forest: biome('forest', '#294536', { ...PBR_FOREST_FLOOR, albedoTint: '#b2aa9b', roughness: 0.97, envMapIntensity: 0.38 }),
  mountain: biome('mountain', '#676863', { ...PBR_ALPINE_ROCK, albedoTint: '#c6c7c2', roughness: 0.88, metalness: 0.018, envMapIntensity: 0.58 }),
  hill: biome('hill', '#87523d', { ...PBR_RED_CLAY, albedoTint: '#e2ded8', roughness: 0.94 }),
  pasture: biome('pasture', '#58744b', { ...PBR_MEADOW, albedoTint: '#bac0a9', roughness: 0.94 }),
  desert: biome('desert', '#b19970', { ...PBR_DUNE_SAND, albedoTint: '#aa9b82', roughness: 0.97 }),
  coast: biome('coast', '#6f8b91', { ...PBR_DUNE_SAND, roughness: 0.72, envMapIntensity: 0.78 }),
  ocean: biome('ocean', '#244f67', { roughness: 0.2, metalness: 0.03, envMapIntensity: 1.15 }),
  river: biome('river', '#47778a', { roughness: 0.24, metalness: 0.025, envMapIntensity: 1.05 }),
  swamp: biome('swamp', '#394536', { roughness: 0.76, clearcoat: 0.22, clearcoatRoughness: 0.5 }),
  volcano: biome('volcano', '#433b3a', { roughness: 0.9, metalness: 0.035 }),
  tundra: biome('tundra', '#9ba7aa', { roughness: 0.84, clearcoat: 0.08 }),
  jungle: biome('jungle', '#23402f', { ...PBR_FOREST_FLOOR, albedoTint: '#9fa995', roughness: 0.97, envMapIntensity: 0.36 }),
  goldmine: biome('goldmine', '#7b735e', { roughness: 0.77, metalness: 0.08, envMapIntensity: 0.82 }),
  sacred: biome('sacred', '#716879', { roughness: 0.68, metalness: 0.035, envMapIntensity: 0.88 }),
  ruins: biome('ruins', '#685b4e', { roughness: 0.92 }),
  glacier: biome('glacier', '#cbd7dc', { roughness: 0.38, clearcoat: 0.28, clearcoatRoughness: 0.26, envMapIntensity: 1.08 }),
  lake: biome('lake', '#386b7c', { roughness: 0.22, metalness: 0.025, envMapIntensity: 1.08 }),
};

export function getBiomeMaterialDefinition(terrain: TerrainType): BiomeMaterialDefinition {
  return BIOME_MATERIALS[terrain] ?? BIOME_MATERIALS.pasture;
}
