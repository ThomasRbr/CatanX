import type { TerrainType } from '@catanx/engine';
import type { ConcreteVisualQuality } from '../quality/renderQuality';
import { H1_MANIFEST_DATA } from './h1ManifestData';
import { H2_MANIFEST_DATA } from './h2ManifestData';
import { H3_MANIFEST_DATA } from './h3ManifestData';
import { CK_MANIFEST_DATA } from './ckManifestData';

export interface VisualAssetDefinition {
  id: string;
  url: string;
  category: string;
  biome?: TerrainType[];
  lod: 0 | 1 | 2;
  footprint: number;
  castsShadow: boolean;
  receivesShadow: boolean;
  animationClips?: string[];
  license: string;
  author: string;
  triangles?: number;
  materials?: number;
  source?: string;
  /** Optional grouped LOD URLs for realistic hero assets. */
  lodUrls?: Partial<Record<0 | 1 | 2, string>>;
  sourceAsset?: string;
  visualTier?: 'legacy-miniature' | 'realistic';
  impostorUrl?: string;
  collisionUrl?: string;
  minimumQuality?: ConcreteVisualQuality;
  preload?: 'startup' | 'board' | 'deferred';
  dependencies?: string[];
  seasonalVariants?: Partial<Record<'spring' | 'summer' | 'autumn' | 'winter', string>>;
  memoryBytes?: number;
  pbr?: {
    albedo?: string;
    normal?: string;
    roughness?: string;
    ao?: string;
    height?: string;
  };
}

function asAssets(
  data: readonly {
    id: string;
    url: string;
    category: string;
    lod: number;
    footprint: number;
    castsShadow: boolean;
    receivesShadow: boolean;
    license: string;
    author: string;
    triangles?: number;
    materials?: number;
    source?: string;
  }[],
): VisualAssetDefinition[] {
  return data.map((asset) => ({
    ...asset,
    lod: asset.lod as 0 | 1 | 2,
  }));
}

/** Combined H1+H2+H3 premium catalog. */
export const H1_VISUAL_ASSETS: VisualAssetDefinition[] = asAssets(H1_MANIFEST_DATA);
export const H2_VISUAL_ASSETS: VisualAssetDefinition[] = asAssets(H2_MANIFEST_DATA);
export const H3_VISUAL_ASSETS: VisualAssetDefinition[] = asAssets(H3_MANIFEST_DATA);
export const CK_VISUAL_ASSETS: VisualAssetDefinition[] = asAssets(CK_MANIFEST_DATA);
export const REALISTIC_SURFACE_ASSETS: VisualAssetDefinition[] = [
  ...([0, 1, 2] as const).map((lod) => ({
    id: `realistic_settlement_lod${lod}`,
    url: `/assets/models/realistic/realistic_settlement_lod${lod}.glb`,
    category: 'buildings',
    lod,
    footprint: 0.36,
    castsShadow: true,
    receivesShadow: true,
    license: 'Original CatanX — generated internal art',
    author: 'CatanX realistic Blender pipeline',
    source: 'tools/blender/generators/generate_realistic_surface_batch.py',
    visualTier: 'realistic' as const,
    minimumQuality: lod === 0 ? 'high' as const : 'low' as const,
    preload: lod === 2 ? 'board' as const : 'deferred' as const,
    dependencies: [],
  })),
  ...([0, 1, 2] as const).map((lod) => ({
    id: `realistic_city_lod${lod}`,
    url: `/assets/models/realistic/realistic_city_lod${lod}.glb`,
    category: 'buildings',
    lod,
    footprint: 0.46,
    castsShadow: true,
    receivesShadow: true,
    license: 'Original CatanX — generated internal art',
    author: 'CatanX realistic Blender pipeline',
    source: 'tools/blender/generators/generate_realistic_surface_batch.py',
    visualTier: 'realistic' as const,
    minimumQuality: lod === 0 ? 'high' as const : 'low' as const,
    preload: lod === 2 ? 'board' as const : 'deferred' as const,
    dependencies: [],
  })),
];
export const VISUAL_ASSETS: VisualAssetDefinition[] = [
  ...H1_VISUAL_ASSETS,
  ...H2_VISUAL_ASSETS,
  ...H3_VISUAL_ASSETS,
  ...CK_VISUAL_ASSETS,
  ...REALISTIC_SURFACE_ASSETS,
];

export const VISUAL_ASSET_BY_ID: Record<string, VisualAssetDefinition> = Object.fromEntries(
  VISUAL_ASSETS.map((asset) => [asset.id, asset]),
);

/** Maps legacy meshCatalog IDs to Blender premium assets. */
export const LEGACY_TO_H1: Record<string, string> = {
  tree: 'tree_pine_a',
  scrub: 'bush_a',
  rock: 'rock_a',
  peak: 'mountain_peak_a',
  dune: 'dune_a',
  settlement: 'house_settlement_a',
  city: 'house_city_a',
  robber: 'robber_a',
};

/**
 * Variant pools for instanced decorations.
 * Sized to keep draw-call layers stable while mixing H1–H3 assets.
 */
export const TREE_VARIANT_IDS = [
  'tree_pine_a',
  'tree_pine_b',
  'tree_oak_a',
  'tree_dead_a',
  'tree_oak_b',
  'tree_pine_dark_a',
  'palm_a',
  'palm_b',
] as const;

export const SCRUB_VARIANT_IDS = [
  'bush_a',
  'bush_flower_a',
  'bush_c',
  'grass_tuft_a',
  'reed_clump_a',
  'marsh_pool_a',
  'snow_patch_a',
  'melt_pool_a',
] as const;

export const ROCK_VARIANT_IDS = [
  'rock_a',
  'rock_c',
  'rock_e',
  'rock_f',
  'ice_block_a',
  'lava_rock_a',
] as const;

export const DUNE_VARIANT_IDS = ['dune_a', 'dune_b'] as const;

export const FIELD_VARIANT_IDS = ['field_row_a', 'field_row_b'] as const;

/** Indices 0–3 kept stable for pasture yard (camp / mine / fence / well). */
export const PROP_VARIANT_IDS = [
  'camp_log_a',
  'mine_entrance_a',
  'fence_a',
  'well_a',
  'civ_column_a',
  'campfire_a',
  'crate_a',
  'tower_a',
  'ruin_wall_a',
  'ruin_arch_a',
  'lava_pool_a',
] as const;

export const HILL_VARIANT_IDS = ['hill_a'] as const;

export function resolveVisualAssetUrl(id: string): string | null {
  // Prefer procedural ridge dunes for H1/H3 ids (tiny GLBs read as rocks).
  if (id === 'dune_a' || id === 'dune_b') return null;
  // H6 procedural biome kits — never load a mismatched GLB.
  if (
    id.startsWith('palm_') ||
    id.startsWith('tree_pine_dark') ||
    id.startsWith('marsh_') ||
    id.startsWith('snow_') ||
    id.startsWith('melt_') ||
    id.startsWith('lava_') ||
    id.startsWith('ruin_') ||
    id.startsWith('ice_block') ||
    id.startsWith('reed_')
  ) {
    return null;
  }

  const direct = VISUAL_ASSET_BY_ID[id];
  if (direct) return direct.url;
  const mapped = LEGACY_TO_H1[id];
  if (mapped && VISUAL_ASSET_BY_ID[mapped]) return VISUAL_ASSET_BY_ID[mapped]!.url;
  // Soft fallbacks while H3 generates.
  if (id === 'tree_group_a') return VISUAL_ASSET_BY_ID.tree_oak_a?.url ?? null;
  if (id === 'tree_dead_a') return VISUAL_ASSET_BY_ID.tree_pine_a?.url ?? null;
  if (id === 'bush_flower_a') return VISUAL_ASSET_BY_ID.bush_a?.url ?? null;
  if (id === 'rock_e' || id === 'rock_f') return VISUAL_ASSET_BY_ID.rock_a?.url ?? null;
  if (id === 'field_row_b') return VISUAL_ASSET_BY_ID.field_row_a?.url ?? null;
  if (id === 'camp_log_a') return VISUAL_ASSET_BY_ID.barrel_a?.url ?? null;
  if (id === 'mine_entrance_a') return VISUAL_ASSET_BY_ID.rock_c?.url ?? null;
  if (id === 'beach_strip_a') return null;
  if (id === 'foam_patch_a') return null;
  return null;
}

/** Map any asset id to a procedural meshCatalog id when GLB is unavailable. */
export function resolveFallbackModelId(assetId: string): string | null {
  if (assetId in LEGACY_TO_H1) return assetId;
  if (assetId.startsWith('tree_')) return 'tree';
  if (assetId.startsWith('bush_') || assetId.startsWith('grass_') || assetId.startsWith('scrub')) {
    return 'scrub';
  }
  if (assetId.startsWith('rock_') || assetId.startsWith('hill_')) return 'rock';
  if (assetId.startsWith('dune')) return 'dune';
  if (assetId.startsWith('mountain_') || assetId.startsWith('peak')) return 'peak';
  if (assetId.startsWith('house_settlement') || assetId === 'settlement') return 'settlement';
  if (assetId.startsWith('house_city') || assetId === 'city') return 'city';
  if (assetId.startsWith('robber')) return 'robber';
  if (assetId.startsWith('banner')) return 'settlement';
  if (
    assetId.startsWith('field_') ||
    assetId.startsWith('dock_') ||
    assetId.startsWith('road_') ||
    assetId.startsWith('beach_') ||
    assetId.startsWith('foam_') ||
    assetId.startsWith('camp_') ||
    assetId.startsWith('mine_') ||
    assetId.startsWith('fence') ||
    assetId.startsWith('well')
  ) {
    return null;
  }
  return null;
}

/** URLs required for the live classic board (preloaded on ThreeHexBoard). */
export const BOARD_PRELOAD_URLS: string[] = [
  ...new Set(
    [
      ...TREE_VARIANT_IDS,
      ...SCRUB_VARIANT_IDS,
      ...ROCK_VARIANT_IDS,
      ...DUNE_VARIANT_IDS,
      ...FIELD_VARIANT_IDS,
      ...PROP_VARIANT_IDS,
      ...HILL_VARIANT_IDS,
      'mountain_peak_a',
      'house_settlement_a',
      'house_settlement_b',
      'house_city_a',
      'banner_a',
      'dock_a',
      'dock_b',
      'road_segment_a',
      'robber_a',
      'beach_strip_a',
      'foam_patch_a',
      ...CK_MANIFEST_DATA.map((asset) => asset.id),
    ]
      .map((id) => resolveVisualAssetUrl(id))
      .filter((url): url is string => Boolean(url)),
  ),
];

export function pickVariantId(pool: readonly string[], variant: number): string {
  return pool[((variant % pool.length) + pool.length) % pool.length]!;
}
