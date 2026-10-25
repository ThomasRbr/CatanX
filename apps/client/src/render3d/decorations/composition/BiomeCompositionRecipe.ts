import type { TerrainType } from '@catanx/engine';

/** Classic + advanced diorama recipes (H3–H6). */
export type CompositionRecipeId =
  | 'forest_dense_clearing'
  | 'forest_edge_mass'
  | 'jungle_canopy'
  | 'pasture_fenced'
  | 'plains_rows'
  | 'hill_quarry'
  | 'mountain_pass'
  | 'mountain_mine'
  | 'desert_wind'
  | 'coast_scrub'
  | 'swamp_reeds'
  | 'volcano_crater'
  | 'tundra_sparse'
  | 'glacier_ice'
  | 'ruins_overgrown'
  | 'goldmine_shaft'
  | 'incomplete_fallback';

export type DecorHeightClass = 'tall' | 'low';

export interface CompositionBudgets {
  tree: [number, number];
  scrub: [number, number];
  rock: [number, number];
  field: [number, number];
  peak: [number, number];
  dune: [number, number];
  hill: [number, number];
  prop: [number, number];
}

export interface BiomeCompositionRecipe {
  id: CompositionRecipeId;
  terrains: TerrainType[];
  weight: number;
  /** Prefer packing toward matching biome edges. */
  edgeBias: number;
  /** Leave a soft clearing near the production token. */
  clearingRadius: number;
  budgets: Partial<CompositionBudgets>;
}

/** Tall objects stay outside this disk; low scrub/fields may enter closer. */
export const DECOR_TALL_CLEAR = 0.3;
export const DECOR_LOW_CLEAR = 0.1;

export function heightClassForKind(
  kind: 'tree' | 'rock' | 'field' | 'peak' | 'scrub' | 'dune' | 'hill' | 'prop',
): DecorHeightClass {
  if (kind === 'scrub' || kind === 'field' || kind === 'dune') return 'low';
  if (kind === 'rock') return 'low';
  return 'tall';
}

export function clearRadiusForKind(
  kind: 'tree' | 'rock' | 'field' | 'peak' | 'scrub' | 'dune' | 'hill' | 'prop',
): number {
  if (kind === 'peak') return DECOR_TALL_CLEAR * 0.85;
  if (kind === 'hill') return DECOR_TALL_CLEAR;
  if (kind === 'tree' || kind === 'prop') return DECOR_TALL_CLEAR;
  if (kind === 'rock') return DECOR_TALL_CLEAR * 0.7;
  if (kind === 'dune') return DECOR_LOW_CLEAR * 0.8;
  return DECOR_LOW_CLEAR;
}

/**
 * Biome visual completeness for H6.
 * - complete: dedicated recipe + paint + landmarks
 * - partial: recipe exists but kit is mostly classic assets
 * - fallback: uses incomplete_fallback scatter
 */
export type BiomeVisualStatus = 'complete' | 'partial' | 'water' | 'fallback';

export const BIOME_VISUAL_STATUS: Record<TerrainType, BiomeVisualStatus> = {
  plains: 'complete',
  forest: 'complete',
  mountain: 'complete',
  hill: 'complete',
  pasture: 'complete',
  desert: 'complete',
  coast: 'complete',
  ocean: 'water',
  lake: 'water',
  river: 'water',
  swamp: 'complete',
  volcano: 'complete',
  tundra: 'complete',
  jungle: 'complete',
  goldmine: 'complete',
  sacred: 'fallback',
  ruins: 'complete',
  glacier: 'complete',
};

/** Explicit fallback when a terrain has no dedicated recipe yet. */
export const INCOMPLETE_BIOME_FALLBACK: BiomeCompositionRecipe = {
  id: 'incomplete_fallback',
  terrains: [],
  weight: 1,
  edgeBias: 0.35,
  clearingRadius: 0.2,
  budgets: {
    rock: [4, 8],
    scrub: [3, 6],
    tree: [0, 2],
  },
};

/**
 * Classic + advanced biome recipes — denser Dorfromantik-style budgets at LOD0.
 */
export const CLASSIC_COMPOSITION_RECIPES: BiomeCompositionRecipe[] = [
  {
    id: 'forest_dense_clearing',
    terrains: ['forest'],
    weight: 3,
    edgeBias: 0.55,
    clearingRadius: 0.22,
    budgets: {
      tree: [18, 28],
      scrub: [8, 14],
      rock: [3, 6],
      // Fallen logs, a campfire, a woodcutter's crate: a forest floor that has
      // something on it reads as a place rather than as a green surface.
      prop: [2, 3],
    },
  },
  {
    id: 'forest_edge_mass',
    terrains: ['forest'],
    weight: 2,
    edgeBias: 0.85,
    clearingRadius: 0.2,
    budgets: {
      tree: [20, 30],
      scrub: [10, 16],
      rock: [3, 5],
      prop: [2, 3],
    },
  },
  {
    id: 'jungle_canopy',
    terrains: ['jungle'],
    weight: 1,
    edgeBias: 0.6,
    clearingRadius: 0.14,
    budgets: {
      tree: [34, 46],
      scrub: [12, 18],
      rock: [3, 6],
      prop: [2, 4],
    },
  },
  {
    id: 'pasture_fenced',
    terrains: ['pasture'],
    weight: 1,
    // Bushes hug the field margins; the middle stays open grazing.
    edgeBias: 0.72,
    clearingRadius: 0.16,
    budgets: {
      // Grazing is what makes a pasture a pasture. At 18-26 the tile read as a
      // thicket of shrubs rather than a field — livestock would have eaten
      // every one of them. What is left is hedgerow, not scrubland.
      scrub: [3, 6],
      // A couple of shade trees per field. More than this and the open grazing
      // the tile is supposed to show disappears under canopy. Two is the floor
      // the composition contract requires.
      tree: [2, 4],
      rock: [1, 2],
      prop: [6, 9],
    },
  },
  {
    id: 'plains_rows',
    terrains: ['plains'],
    weight: 1,
    edgeBias: 0.25,
    clearingRadius: 0.16,
    budgets: {
      field: [42, 58],
      scrub: [1, 2],
      // A worked field has fences, a cart, a well. Zero props left the most
      // recognisable tile on the board as an empty golden plane.
      prop: [3, 5],
    },
  },
  {
    id: 'hill_quarry',
    terrains: ['hill'],
    weight: 1,
    edgeBias: 0.5,
    clearingRadius: 0.12,
    budgets: {
      rock: [14, 22],
      hill: [3, 5],
      scrub: [3, 6],
      prop: [2, 4],
    },
  },
  {
    id: 'mountain_pass',
    terrains: ['mountain'],
    weight: 2,
    edgeBias: 0.3,
    clearingRadius: 0.12,
    budgets: {
      peak: [1, 1],
      rock: [8, 14],
      scrub: [0, 0],
      prop: [1, 3],
    },
  },
  {
    id: 'mountain_mine',
    terrains: ['mountain'],
    weight: 1,
    edgeBias: 0.3,
    clearingRadius: 0.1,
    budgets: {
      peak: [1, 1],
      rock: [10, 16],
      prop: [1, 1],
    },
  },
  {
    id: 'goldmine_shaft',
    terrains: ['goldmine'],
    weight: 1,
    edgeBias: 0.28,
    clearingRadius: 0.1,
    budgets: {
      peak: [1, 1],
      rock: [10, 16],
      prop: [2, 3],
    },
  },
  {
    id: 'volcano_crater',
    terrains: ['volcano'],
    weight: 1,
    edgeBias: 0.25,
    clearingRadius: 0.14,
    budgets: {
      peak: [1, 1],
      rock: [14, 20],
      scrub: [0, 0],
      prop: [3, 4],
    },
  },
  {
    id: 'desert_wind',
    terrains: ['desert'],
    weight: 1,
    edgeBias: 0.75,
    clearingRadius: 0.1,
    budgets: {
      dune: [20, 32],
      rock: [0, 0],
      tree: [0, 0],
      scrub: [0, 0],
      prop: [0, 0],
    },
  },
  {
    id: 'coast_scrub',
    terrains: ['coast'],
    weight: 1,
    edgeBias: 0.9,
    clearingRadius: 0.18,
    budgets: {
      rock: [6, 12],
      scrub: [4, 8],
    },
  },
  {
    id: 'swamp_reeds',
    terrains: ['swamp'],
    weight: 1,
    edgeBias: 0.5,
    clearingRadius: 0.16,
    budgets: {
      scrub: [22, 34],
      tree: [3, 6],
      rock: [3, 6],
      prop: [1, 2],
    },
  },
  {
    id: 'tundra_sparse',
    terrains: ['tundra'],
    weight: 1,
    edgeBias: 0.55,
    clearingRadius: 0.16,
    budgets: {
      // Sapins modérés — place pour les troupeaux
      tree: [10, 15],
      rock: [6, 10],
      scrub: [8, 12],
      peak: [0, 0],
    },
  },
  {
    id: 'glacier_ice',
    terrains: ['glacier'],
    weight: 1,
    edgeBias: 0.3,
    clearingRadius: 0.12,
    budgets: {
      rock: [16, 24],
      peak: [0, 0],
      scrub: [14, 20],
    },
  },
  {
    id: 'ruins_overgrown',
    terrains: ['ruins'],
    weight: 1,
    edgeBias: 0.4,
    clearingRadius: 0.16,
    budgets: {
      scrub: [8, 14],
      rock: [5, 9],
      tree: [2, 4],
      prop: [5, 8],
    },
  },
];

export function recipesForTerrain(terrain: TerrainType): BiomeCompositionRecipe[] {
  const status = BIOME_VISUAL_STATUS[terrain];
  if (status === 'water') return [];
  const list = CLASSIC_COMPOSITION_RECIPES.filter((r) => r.terrains.includes(terrain));
  if (list.length > 0) return list;
  // Explicit incomplete fallback — never silent empty land tiles.
  return [{ ...INCOMPLETE_BIOME_FALLBACK, terrains: [terrain] }];
}

export function biomeVisualStatus(terrain: TerrainType): BiomeVisualStatus {
  return BIOME_VISUAL_STATUS[terrain] ?? 'fallback';
}
