import type { TerrainType } from '@catanx/engine';

/**
 * Expert miniature palettes — each biome reads at a glance without props.
 * Five tones: base, accent (patches), highlight (crests), soil (earth), side (cliff).
 */

export const TERRAIN_BASE_COLORS: Record<TerrainType, string> = {
  plains: '#a88743',
  forest: '#294536',
  mountain: '#676863',
  hill: '#87523d',
  pasture: '#58744b',
  desert: '#b19970',
  coast: '#6f8b91',
  ocean: '#244f67',
  river: '#47778a',
  swamp: '#394536',
  volcano: '#433b3a',
  tundra: '#9ba7aa',
  jungle: '#23402f',
  goldmine: '#7b735e',
  sacred: '#716879',
  ruins: '#685b4e',
  glacier: '#cbd7dc',
  lake: '#386b7c',
};

export const TERRAIN_SIDE_COLORS: Record<TerrainType, string> = {
  plains: '#695331',
  forest: '#1d2e25',
  mountain: '#464641',
  hill: '#56382e',
  pasture: '#354c34',
  desert: '#77634a',
  coast: '#465e63',
  ocean: '#18394c',
  river: '#2d5362',
  swamp: '#242d24',
  volcano: '#2b2324',
  tundra: '#69777b',
  jungle: '#172b21',
  goldmine: '#514b3f',
  sacred: '#4a4350',
  ruins: '#463c34',
  glacier: '#84979e',
  lake: '#244d5b',
};

export const TERRAIN_ACCENT_COLORS: Record<TerrainType, string> = {
  plains: '#7f6435',
  forest: '#20382b',
  mountain: '#565752',
  hill: '#6d4334',
  pasture: '#42603d',
  desert: '#9a805b',
  coast: '#58767c',
  ocean: '#1b4259',
  river: '#356676',
  swamp: '#303b2f',
  volcano: '#653832',
  tundra: '#849397',
  jungle: '#1b3628',
  goldmine: '#6c624c',
  sacred: '#5e5367',
  ruins: '#584b40',
  glacier: '#afc1c8',
  lake: '#2f6070',
};

export const TERRAIN_HIGHLIGHT_COLORS: Record<TerrainType, string> = {
  plains: '#c3a760',
  forest: '#59705b',
  mountain: '#999991',
  hill: '#b47b5c',
  pasture: '#829777',
  desert: '#d1bd94',
  coast: '#96afb3',
  ocean: '#47778d',
  river: '#6596a6',
  swamp: '#56634f',
  volcano: '#b36344',
  tundra: '#cbd4d6',
  jungle: '#456a50',
  goldmine: '#ad9d76',
  sacred: '#95849c',
  ruins: '#92806e',
  glacier: '#edf3f5',
  lake: '#6090a0',
};

export const TERRAIN_SOIL_COLORS: Record<TerrainType, string> = {
  plains: '#806122',
  forest: '#403324',
  mountain: '#464948',
  hill: '#623b2c',
  pasture: '#5d4d33',
  desert: '#8d6e49',
  coast: '#8a7860',
  ocean: '#1a384e',
  river: '#345868',
  swamp: '#343828',
  volcano: '#4a3030',
  tundra: '#7e8890',
  jungle: '#3a2e1c',
  goldmine: '#6a5438',
  sacred: '#544850',
  ruins: '#544840',
  glacier: '#7e90a0',
  lake: '#345868',
};

/** Optional cool recess tint (used sparingly as material, not lighting). */
export const TERRAIN_SHADOW_COLORS: Record<TerrainType, string> = {
  plains: '#c8a828',
  forest: '#2a4232',
  mountain: '#4a4844',
  hill: '#745830',
  pasture: '#4a6e34',
  desert: '#b09860',
  coast: '#5a7880',
  ocean: '#203e58',
  river: '#345e74',
  swamp: '#384030',
  volcano: '#544444',
  tundra: '#84909a',
  jungle: '#223828',
  goldmine: '#706850',
  sacred: '#544858',
  ruins: '#544840',
  glacier: '#8ea0ac',
  lake: '#345e74',
};

export function terrainColor(terrain: TerrainType): string {
  return TERRAIN_BASE_COLORS[terrain] ?? '#8899aa';
}

export function terrainSideColor(terrain: TerrainType): string {
  return TERRAIN_SIDE_COLORS[terrain] ?? '#667788';
}

export function terrainAccentColor(terrain: TerrainType): string {
  return TERRAIN_ACCENT_COLORS[terrain] ?? '#778899';
}
