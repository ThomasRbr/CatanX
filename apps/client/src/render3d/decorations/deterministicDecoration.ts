import type { HexTile, TerrainType } from '@catanx/engine';
import { HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { edgeOffset } from '../utils/hexEdges';
import { rngInt, rngRange, visualRngFor } from '../utils/seededVisualRandom';
import {
  clearRadiusForKind,
  DECOR_LOW_CLEAR,
  DECOR_TALL_CLEAR,
  heightClassForKind,
  recipesForTerrain,
  type BiomeCompositionRecipe,
  type CompositionBudgets,
} from './composition/BiomeCompositionRecipe';
import {
  buildNeighborMap,
  type NeighborVisualContext,
} from './composition/NeighborVisualContext';

/** @deprecated Prefer DECOR_TALL_CLEAR — kept for tests / callers. */
export const DECOR_CENTER_CLEAR = DECOR_TALL_CLEAR;
export const DECOR_EDGE_MARGIN = 0.2;
/** Keep tall props off settlement vertices. */
export const DECOR_VERTEX_CLEAR = 0.16;
/** H7 — minimum spacing between tall decor instances on one tile. */
export const TALL_DECOR_MIN_DIST = 0.16;
export const TALL_DECOR_MIN_DIST_SQ = TALL_DECOR_MIN_DIST * TALL_DECOR_MIN_DIST;

export type DecorKind = 'tree' | 'rock' | 'field' | 'peak' | 'scrub' | 'dune' | 'hill' | 'prop';

export interface DecorInstance {
  kind: DecorKind;
  tileId: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  scale: number;
  variant: number;
}

const WATER: ReadonlySet<TerrainType> = new Set(['ocean', 'coast', 'lake', 'river']);

const HEX_VERTICES: Array<{ x: number; z: number }> = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return {
    x: HEX_WORLD_RADIUS * Math.cos(angle),
    z: HEX_WORLD_RADIUS * Math.sin(angle),
  };
});

export function isWaterTerrain(terrain: TerrainType): boolean {
  return WATER.has(terrain);
}

export function isInsideTokenClearance(x: number, z: number): boolean {
  return x * x + z * z < DECOR_TALL_CLEAR * DECOR_TALL_CLEAR;
}

export function isInsideLowClearance(x: number, z: number): boolean {
  return x * x + z * z < DECOR_LOW_CLEAR * DECOR_LOW_CLEAR;
}

export function isNearHexVertex(x: number, z: number, clear = DECOR_VERTEX_CLEAR): boolean {
  const c2 = clear * clear;
  for (const v of HEX_VERTICES) {
    const dx = x - v.x;
    const dz = z - v.z;
    if (dx * dx + dz * dz < c2) return true;
  }
  return false;
}

function minRadiusFor(kind: DecorKind, recipe: BiomeCompositionRecipe): number {
  const base = clearRadiusForKind(kind);
  if (heightClassForKind(kind) === 'tall') {
    return Math.max(base, recipe.clearingRadius);
  }
  return base;
}

function sampleDisk(
  rng: () => number,
  minR: number,
  maxR: number,
  kind: DecorKind,
): { x: number; z: number } | null {
  const edgeLimit = HEX_WORLD_RADIUS - DECOR_EDGE_MARGIN;
  const tall = heightClassForKind(kind) === 'tall';
  for (let attempt = 0; attempt < 48; attempt++) {
    const angle = rngRange(rng, 0, Math.PI * 2);
    const radius = Math.sqrt(rngRange(rng, minR * minR, maxR * maxR));
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (x * x + z * z > edgeLimit * edgeLimit || x * x + z * z < minR * minR) continue;
    if (tall && isNearHexVertex(x, z)) continue;
    return { x, z };
  }
  return null;
}

/** Bias samples toward preferred edge directions (neighbor continuity). */
function sampleBiased(
  rng: () => number,
  minR: number,
  maxR: number,
  preferredDirs: number[],
  bias: number,
  kind: DecorKind,
): { x: number; z: number } | null {
  if (preferredDirs.length === 0 || bias <= 0) return sampleDisk(rng, minR, maxR, kind);
  const edgeLimit = HEX_WORLD_RADIUS - DECOR_EDGE_MARGIN;
  const tall = heightClassForKind(kind) === 'tall';
  for (let attempt = 0; attempt < 56; attempt++) {
    const useBias = rng() < bias;
    let angle: number;
    if (useBias) {
      const dir = preferredDirs[rngInt(rng, 0, preferredDirs.length - 1)]!;
      // Edge midpoint for dir d is at 60°·d (vertices sit at 60°·i − 30°).
      const base = (Math.PI / 180) * (60 * dir);
      angle = base + rngRange(rng, -0.45, 0.45);
    } else {
      angle = rngRange(rng, 0, Math.PI * 2);
    }
    // Keep biased samples slightly inward so edge masses don't spill off the slab.
    const maxBiased = useBias ? Math.min(maxR, edgeLimit * 0.92) : maxR;
    const radius = Math.sqrt(rngRange(rng, minR * minR, maxBiased * maxBiased));
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (x * x + z * z > edgeLimit * edgeLimit || x * x + z * z < minR * minR) continue;
    if (tall && isNearHexVertex(x, z)) continue;
    return { x, z };
  }
  return sampleDisk(rng, minR, maxR, kind);
}

function isTallDecorKind(kind: DecorKind): boolean {
  return kind === 'tree' || kind === 'prop' || kind === 'peak' || kind === 'hill';
}

function isTooCloseToTallDecor(
  items: DecorInstance[],
  tileId: string,
  x: number,
  z: number,
  minDistSq = TALL_DECOR_MIN_DIST_SQ,
): boolean {
  for (const item of items) {
    if (item.tileId !== tileId || !isTallDecorKind(item.kind)) continue;
    const dx = item.x - x;
    const dz = item.z - z;
    if (dx * dx + dz * dz < minDistSq) return true;
  }
  return false;
}

function pushDecor(
  items: DecorInstance[],
  tileId: string,
  kind: DecorKind,
  x: number,
  z: number,
  rotation: number,
  scale: number,
  variant: number,
): boolean {
  if (isTallDecorKind(kind) && isTooCloseToTallDecor(items, tileId, x, z)) return false;
  items.push({
    kind,
    tileId,
    x,
    y: 0.14,
    z,
    rotation,
    scale,
    variant,
  });
  return true;
}

function pickRecipe(terrain: TerrainType, rng: () => number): BiomeCompositionRecipe | null {
  const list = recipesForTerrain(terrain);
  if (list.length === 0) return null;
  const total = list.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total;
  for (const recipe of list) {
    roll -= recipe.weight;
    if (roll <= 0) return recipe;
  }
  return list[list.length - 1]!;
}

function budgetCount(
  rng: () => number,
  budgets: Partial<CompositionBudgets>,
  key: keyof CompositionBudgets,
): number {
  const range = budgets[key];
  if (!range) return 0;
  return rngInt(rng, range[0], range[1]);
}

function placeKind(
  items: DecorInstance[],
  tileId: string,
  kind: DecorKind,
  count: number,
  rng: () => number,
  preferredDirs: number[],
  edgeBias: number,
  scaleMin: number,
  scaleMax: number,
  recipe: BiomeCompositionRecipe,
  windRot?: number,
): void {
  const maxR = HEX_WORLD_RADIUS - DECOR_EDGE_MARGIN;
  const minR = minRadiusFor(kind, recipe);
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 14) {
    attempts++;
    const pos = sampleBiased(rng, minR, maxR, preferredDirs, edgeBias, kind);
    if (!pos) continue;
    const rot =
      windRot !== undefined && (kind === 'dune' || kind === 'field')
        ? windRot + rngRange(rng, -0.12, 0.12)
        : rngRange(rng, 0, Math.PI * 2);
    const ok = pushDecor(
      items,
      tileId,
      kind,
      pos.x,
      pos.z,
      rot,
      rngRange(rng, scaleMin, scaleMax),
      rngInt(rng, 0, 7),
    );
    if (ok) placed++;
  }
}

function placePlainsRows(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  fieldCount: number,
  neighbors: NeighborVisualContext | undefined,
  recipe: BiomeCompositionRecipe,
): void {
  const maxR = HEX_WORLD_RADIUS - 0.12;
  let baseRot = rngRange(rng, 0, Math.PI);
  if (neighbors && neighbors.sameBiomeDirs.length > 0) {
    const dir = neighbors.sameBiomeDirs[0]!;
    baseRot = (Math.PI / 180) * (60 * dir - 30) + Math.PI / 2;
  }
  const cos = Math.cos(baseRot);
  const sin = Math.sin(baseRot);

  // Dense parallel furrows covering most of the hex.
  const rowSpacing = 0.095;
  const halfRows = Math.max(5, Math.ceil(fieldCount / 5));
  let placed = 0;
  for (let row = -halfRows; row <= halfRows; row++) {
    const across = row * rowSpacing;
    // More segments along each furrow toward the edges.
    const alongCount = 3 + (Math.abs(row) < 2 ? 2 : 1);
    for (let a = 0; a < alongCount; a++) {
      const along = -0.42 + (a / Math.max(1, alongCount - 1)) * 0.84 + rngRange(rng, -0.03, 0.03);
      const x = cos * along - sin * across;
      const z = sin * along + cos * across;
      if (x * x + z * z > maxR * maxR) continue;
      if (x * x + z * z < 0.14) {
        // Production chits need a real visual clearing, not a single missing
        // stalk: dense neighboring plains must never swallow their numbers.
        continue;
      }
      if (isNearHexVertex(x, z, DECOR_VERTEX_CLEAR * 0.55)) continue;
      const scale =
        Math.abs(row) >= halfRows - 1
          ? rngRange(rng, 0.75, 0.95)
          : rngRange(rng, 0.9, 1.12);
      pushDecor(items, tile.id, 'field', x, z, baseRot, scale, placed % 3);
      placed++;
    }
  }

  // Rim fill — short sheaves near the hex edge so the floor never looks bare.
  const rimCount = rngInt(rng, 6, 10);
  for (let i = 0; i < rimCount; i++) {
    const ang = (i / rimCount) * Math.PI * 2 + rngRange(rng, -0.05, 0.05);
    const r = rngRange(rng, 0.62, 0.78);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (isNearHexVertex(x, z, DECOR_VERTEX_CLEAR * 0.5)) continue;
    pushDecor(
      items,
      tile.id,
      'field',
      x,
      z,
      baseRot + rngRange(rng, -0.08, 0.08),
      rngRange(rng, 0.6, 0.85),
      2, // sheaf variant
    );
  }
}

function placeEdgeAccent(
  items: DecorInstance[],
  tile: HexTile,
  neighbors: NeighborVisualContext,
  rng: () => number,
  recipe: BiomeCompositionRecipe,
): void {
  for (const dir of neighbors.sameBiomeDirs) {
    if (rng() > recipe.edgeBias * 0.45) continue;
    const off = edgeOffset(dir, HEX_WORLD_RADIUS * rngRange(rng, 0.48, 0.62));
    const kind: DecorKind =
      tile.terrain === 'forest' || tile.terrain === 'jungle'
        ? 'scrub'
        : tile.terrain === 'swamp'
          ? 'scrub'
          : tile.terrain === 'desert'
            ? 'dune'
            : tile.terrain === 'mountain' || tile.terrain === 'goldmine'
              ? 'rock'
              : tile.terrain === 'glacier'
                ? 'rock'
                : tile.terrain === 'plains'
                  ? 'field'
                  : 'scrub';
    const minR = minRadiusFor(kind, recipe);
    if (off.x * off.x + off.z * off.z < minR * minR) continue;
    if (heightClassForKind(kind) === 'tall' && isNearHexVertex(off.x, off.z)) continue;
    const variant =
      tile.terrain === 'swamp' && kind === 'scrub'
        ? SCRUB_REED
        : tile.terrain === 'glacier' && kind === 'rock'
          ? ROCK_ICE
          : kind === 'scrub' &&
              (tile.terrain === 'pasture' ||
                tile.terrain === 'forest' ||
                tile.terrain === 'jungle' ||
                tile.terrain === 'plains')
            ? pickDecorVariant(rng, MEADOW_SCRUB_VARIANTS)
            : rngInt(rng, 0, 5);
    pushDecor(
      items,
      tile.id,
      kind,
      off.x,
      off.z,
      rngRange(rng, 0, Math.PI * 2),
      rngRange(rng, 0.85, 1.2),
      variant,
    );
  }
  for (const dir of neighbors.coastDirs) {
    if (rng() > 0.45) continue;
    const off = edgeOffset(dir, HEX_WORLD_RADIUS * rngRange(rng, 0.55, 0.7));
    if (isNearHexVertex(off.x, off.z)) continue;
    // Desert coasts get dunes, not rocks that read as “wrong biome”.
    const kind: DecorKind = tile.terrain === 'desert' ? 'dune' : 'rock';
    pushDecor(
      items,
      tile.id,
      kind,
      off.x,
      off.z,
      rngRange(rng, 0, Math.PI * 2),
      rngRange(rng, kind === 'dune' ? 0.45 : 0.5, kind === 'dune' ? 0.75 : 0.85),
      rngInt(rng, 0, 5),
    );
  }
}

function placeDesertDunes(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
  windRot: number,
): void {
  // Hero mound near center so the tile always has a clear dune mass.
  pushDecor(
    items,
    tile.id,
    'dune',
    rngRange(rng, -0.08, 0.08),
    rngRange(rng, -0.08, 0.08),
    windRot + rngRange(rng, -0.1, 0.1),
    rngRange(rng, 1.25, 1.5),
    0, // mound variant
  );

  // Explicit rim ring — fills the hex out to the edges (classic desert is often the board center).
  const rimCount = rngInt(rng, 10, 14);
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2 + rngRange(rng, -0.08, 0.08);
    const r = rngRange(rng, 0.58, 0.78);
    pushDecor(
      items,
      tile.id,
      'dune',
      Math.cos(a) * r,
      Math.sin(a) * r,
      windRot + rngRange(rng, -0.15, 0.15),
      rngRange(rng, 0.45, 0.75),
      rngInt(rng, 0, 2),
    );
  }

  // Mid ring fill
  const midCount = rngInt(rng, 8, 12);
  for (let i = 0; i < midCount; i++) {
    const a = (i / midCount) * Math.PI * 2 + 0.35 + rngRange(rng, -0.1, 0.1);
    const r = rngRange(rng, 0.28, 0.52);
    pushDecor(
      items,
      tile.id,
      'dune',
      Math.cos(a) * r,
      Math.sin(a) * r,
      windRot + rngRange(rng, -0.12, 0.12),
      rngRange(rng, 0.7, 1.15),
      rngInt(rng, 0, 2),
    );
  }

  // Extra scatter for density (wind-aligned via placeKind).
  placeKind(
    items,
    tile.id,
    'dune',
    rngInt(rng, 6, 10),
    rng,
    preferredDirs,
    0.55,
    0.4,
    0.85,
    recipe,
    windRot,
  );
}

function placeMountainHero(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  _preferredDirs: number[],
  _recipe: BiomeCompositionRecipe,
): void {
  // One hero peak — no baked hex apron (that rotated out of the tile).
  pushDecor(
    items,
    tile.id,
    'peak',
    0,
    0,
    rngRange(rng, 0, Math.PI * 2),
    rngRange(rng, 1.0, 1.04),
    rngInt(rng, 0, 2),
  );
  // Keep the alpine silhouette clean. Generic prop variants include large
  // landmarks whose authored scale reads as polygonal walls on a mountain.
}

function placePastureYard(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  recipe: BiomeCompositionRecipe,
): void {
  // PROP_VARIANT_IDS: 0 camp/barrel, 1 mine/crate, 2 fence, 3 well
  const FENCE = 2;
  const WELL = 3;
  const BARREL = 0;
  const segments = Math.min(budgetCount(rng, recipe.budgets, 'prop'), rngInt(rng, 4, 6));
  const baseAng = rng() * Math.PI * 2;
  const arc = Math.PI * (0.5 + rng() * 0.35);
  const r = rngRange(rng, 0.38, 0.5);
  for (let i = 0; i < segments; i++) {
    const t = segments === 1 ? 0.5 : i / (segments - 1);
    const a = baseAng + (t - 0.5) * arc;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isInsideTokenClearance(x, z) || isNearHexVertex(x, z)) continue;
    pushDecor(
      items,
      tile.id,
      'prop',
      x,
      z,
      a + Math.PI / 2,
      rngRange(rng, 0.9, 1.1),
      FENCE,
    );
  }
  if (rng() > 0.35) {
    const wellR = rngRange(rng, 0.12, 0.22);
    const wellA = baseAng + Math.PI + rngRange(rng, -0.4, 0.4);
    const wx = Math.cos(wellA) * wellR;
    const wz = Math.sin(wellA) * wellR;
    if (!isInsideTokenClearance(wx, wz)) {
      pushDecor(items, tile.id, 'prop', wx, wz, rng() * Math.PI * 2, rngRange(rng, 0.85, 1.0), WELL);
    }
  }
  if (rng() > 0.4) {
    const mid = baseAng;
    const bx = Math.cos(mid) * (r - 0.08);
    const bz = Math.sin(mid) * (r - 0.08);
    if (!isInsideTokenClearance(bx, bz)) {
      pushDecor(items, tile.id, 'prop', bx, bz, rng() * Math.PI * 2, rngRange(rng, 0.75, 0.95), BARREL);
    }
  }
}

const NON_MOUNTAIN_DECOR_SCALE = 0.82;
const PROP_DECOR_SCALE = 0.55;

/** PROP_VARIANT_IDS indices (stable 0–3 for pasture). */
const PROP_CAMP = 0;
const PROP_MINE = 1;
const PROP_COLUMN = 4;
const PROP_CAMPFIRE = 5;
const PROP_CRATE = 6;
const PROP_TOWER = 7;
const PROP_RUIN_WALL = 8;
const PROP_RUIN_ARCH = 9;
const PROP_LAVA_POOL = 10;
const SCRUB_REED = 4;
const SCRUB_MARSH = 5;
const SCRUB_SNOW = 6;
const SCRUB_MELT = 7;
const ROCK_ICE = 4;
const ROCK_LAVA = 5;
const TREE_DEAD = 3;
const TREE_DARK_PINE = 5;
const TREE_PALM_A = 6;
const TREE_PALM_B = 7;
/** Indices into TREE_VARIANT_IDS — temperate mix (no palms 6/7).
 * Was [0,1]-only spruce; that locked naturalized forests into broccoli blobs. */
const TEMPERATE_TREE_VARIANTS = [0, 1, 2, 3, 4, 5] as const;
/** Indices into SCRUB_VARIANT_IDS — green meadow undergrowth (no reeds / snow / water). */
const MEADOW_SCRUB_VARIANTS = [0, 1, 2, 3] as const;

function pickDecorVariant(rng: () => number, pool: readonly number[]): number {
  return pool[rngInt(rng, 0, pool.length - 1)]!;
}

function forceVariantsForTile(
  items: DecorInstance[],
  tileId: string,
  kind: DecorKind,
  pool: readonly number[],
  rng: () => number,
): void {
  for (const item of items) {
    if (item.kind === kind && item.tileId === tileId) {
      item.variant = pickDecorVariant(rng, pool);
    }
  }
}
function isMountainishTerrain(terrain: TerrainType): boolean {
  return terrain === 'mountain' || terrain === 'goldmine';
}

function applyDecorScale(items: DecorInstance[], terrain: TerrainType): DecorInstance[] {
  if (isMountainishTerrain(terrain) || terrain === 'volcano') return items;
  for (const item of items) {
    if (item.kind === 'prop') {
      // H6 landmarks (column / campfire / crate / tower, indices ≥4) keep authored scale.
      if (item.variant >= 4) continue;
      item.scale *= PROP_DECOR_SCALE;
      continue;
    }
    const mul = item.kind === 'field' ? NON_MOUNTAIN_DECOR_SCALE * 0.95 : NON_MOUNTAIN_DECOR_SCALE;
    item.scale *= mul;
  }
  return items;
}

function pushLandmark(
  items: DecorInstance[],
  tileId: string,
  x: number,
  z: number,
  rot: number,
  scale: number,
  variant: number,
): void {
  // Landmarks may sit closer than tall trees — only avoid the token pin + vertices.
  if (isInsideLowClearance(x, z) || isNearHexVertex(x, z, DECOR_VERTEX_CLEAR * 1.05)) return;
  if (isTooCloseToTallDecor(items, tileId, x, z, TALL_DECOR_MIN_DIST_SQ * 0.72)) return;
  pushDecor(items, tileId, 'prop', x, z, rot, scale, variant);
}

function placeVolcanoCrater(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
): void {
  // Mountain-scale lava massif (fills the hex like alpine peaks).
  pushDecor(
    items,
    tile.id,
    'peak',
    0,
    0,
    rngRange(rng, 0, Math.PI * 2),
    rngRange(rng, 1.02, 1.08),
    0,
  );
  const rockN = budgetCount(rng, recipe.budgets, 'rock');
  placeKind(items, tile.id, 'rock', rockN, rng, preferredDirs, 0.3, 0.7, 1.15, recipe);
  for (const item of items) {
    if (item.kind === 'rock' && item.tileId === tile.id) item.variant = ROCK_LAVA;
  }
  pushLandmark(items, tile.id, 0.28, 0.1, 0, 0.75, PROP_LAVA_POOL);
  pushLandmark(items, tile.id, -0.26, 0.14, 0.8, 0.65, PROP_LAVA_POOL);
  if (rng() > 0.3) pushLandmark(items, tile.id, 0.06, -0.28, 0.3, 0.6, PROP_LAVA_POOL);
}

function placeGoldmineShaft(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
): void {
  placeMountainHero(items, tile, rng, preferredDirs, recipe);
  pushLandmark(items, tile.id, 0.24, 0.1, 0.35, 0.95, PROP_MINE);
  pushLandmark(items, tile.id, -0.2, 0.18, 1.1, 0.6, PROP_CRATE);
  if (rng() > 0.4) pushLandmark(items, tile.id, 0.14, -0.22, 0.25, 0.55, PROP_CAMP);
}

function placeSwampReeds(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
): void {
  const maxR = HEX_WORLD_RADIUS - DECOR_EDGE_MARGIN;
  // Marsh puddles first — dull wet floor.
  const pools = rngInt(rng, 4, 7);
  for (let i = 0; i < pools; i++) {
    const a = (i / pools) * Math.PI * 2 + rngRange(rng, -0.2, 0.2);
    const r = rngRange(rng, 0.22, 0.62);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isNearHexVertex(x, z)) continue;
    pushDecor(items, tile.id, 'scrub', x, z, rng() * Math.PI * 2, rngRange(rng, 0.95, 1.35), SCRUB_MARSH);
  }
  // Dense dull reeds.
  const reedCount = budgetCount(rng, recipe.budgets, 'scrub');
  const minR = minRadiusFor('scrub', recipe);
  let placed = 0;
  let attempts = 0;
  while (placed < reedCount && attempts < reedCount * 14) {
    attempts++;
    const pos = sampleBiased(rng, minR, maxR, preferredDirs, recipe.edgeBias * 0.55, 'scrub');
    if (!pos) continue;
    pushDecor(
      items,
      tile.id,
      'scrub',
      pos.x,
      pos.z,
      rngRange(rng, 0, Math.PI * 2),
      rngRange(rng, 0.95, 1.35),
      SCRUB_REED,
    );
    placed++;
  }
  // Mostly dead / drowning trees.
  placeKind(
    items,
    tile.id,
    'tree',
    budgetCount(rng, recipe.budgets, 'tree'),
    rng,
    preferredDirs,
    0.25,
    0.5,
    0.75,
    recipe,
  );
  for (const item of items) {
    if (item.kind === 'tree' && item.tileId === tile.id) item.variant = TREE_DEAD;
  }
  placeKind(
    items,
    tile.id,
    'rock',
    budgetCount(rng, recipe.budgets, 'rock'),
    rng,
    preferredDirs,
    0.3,
    0.45,
    0.8,
    recipe,
  );
  // Fallen camp / mossy log accents.
  pushLandmark(items, tile.id, 0.24, -0.14, 0.6, 0.65, PROP_CAMP);
  if (rng() > 0.4) pushLandmark(items, tile.id, -0.2, 0.18, 1.1, 0.5, PROP_CRATE);
}

function placeGlacierIce(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
): void {
  // Hero snow-capped ice.
  pushDecor(
    items,
    tile.id,
    'rock',
    rngRange(rng, -0.05, 0.05),
    rngRange(rng, -0.05, 0.05),
    rng() * Math.PI * 2,
    rngRange(rng, 1.45, 1.65),
    ROCK_ICE,
  );
  const iceCount = budgetCount(rng, recipe.budgets, 'rock');
  placeKind(items, tile.id, 'rock', iceCount, rng, preferredDirs, 0.35, 0.85, 1.35, recipe);
  for (const item of items) {
    if (item.kind === 'rock' && item.tileId === tile.id) item.variant = ROCK_ICE;
  }
  const maxR = HEX_WORLD_RADIUS - DECOR_EDGE_MARGIN;
  // Meltwater pools.
  const meltN = rngInt(rng, 3, 5);
  for (let i = 0; i < meltN; i++) {
    const a = (i / meltN) * Math.PI * 2 + rngRange(rng, -0.2, 0.2);
    const r = rngRange(rng, 0.28, 0.58);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isNearHexVertex(x, z) || isInsideLowClearance(x, z)) continue;
    pushDecor(items, tile.id, 'scrub', x, z, rng() * Math.PI, rngRange(rng, 0.9, 1.25), SCRUB_MELT);
  }
  // Dense snow blankets.
  const snowN = rngInt(rng, 12, 18);
  for (let i = 0; i < snowN; i++) {
    const a = (i / snowN) * Math.PI * 2 + rngRange(rng, -0.12, 0.12);
    const r = rngRange(rng, 0.16, maxR * 0.94);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isNearHexVertex(x, z, DECOR_VERTEX_CLEAR * 0.55)) continue;
    pushDecor(items, tile.id, 'scrub', x, z, rng() * Math.PI, rngRange(rng, 0.9, 1.45), SCRUB_SNOW);
  }
}

function placeRuinsOvergrown(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
): void {
  placeKind(items, tile.id, 'scrub', budgetCount(rng, recipe.budgets, 'scrub'), rng, preferredDirs, 0.4, 0.7, 1.15, recipe);
  placeKind(items, tile.id, 'rock', budgetCount(rng, recipe.budgets, 'rock'), rng, preferredDirs, 0.35, 0.6, 1.05, recipe);
  placeKind(items, tile.id, 'tree', budgetCount(rng, recipe.budgets, 'tree'), rng, preferredDirs, 0.25, 0.45, 0.7, recipe);
  // Dense ruin kit — walls, arches, columns, tower stump.
  pushLandmark(items, tile.id, -0.16, 0.06, 0.15, 0.85, PROP_RUIN_WALL);
  pushLandmark(items, tile.id, 0.14, -0.12, 1.1, 0.8, PROP_RUIN_WALL);
  pushLandmark(items, tile.id, 0.02, 0.18, 0.4, 0.9, PROP_RUIN_ARCH);
  pushLandmark(items, tile.id, -0.08, -0.16, 0.05, 0.7, PROP_COLUMN);
  pushLandmark(items, tile.id, 0.2, 0.1, 0.7, 0.6, PROP_TOWER);
  pushLandmark(items, tile.id, -0.22, 0.2, 0.9, 0.55, PROP_COLUMN);
  if (rng() > 0.3) pushLandmark(items, tile.id, 0.08, -0.22, 0.5, 0.5, PROP_CRATE);
  if (rng() > 0.5) pushLandmark(items, tile.id, 0.22, 0.18, 0.2, 0.75, PROP_RUIN_WALL);
}

function placeForestCanopy(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
  windRot: number,
): void {
  placeKind(
    items,
    tile.id,
    'tree',
    budgetCount(rng, recipe.budgets, 'tree'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.75,
    0.72,
    1.05,
    recipe,
  );
  forceVariantsForTile(items, tile.id, 'tree', TEMPERATE_TREE_VARIANTS, rng);
  placeKind(
    items,
    tile.id,
    'scrub',
    budgetCount(rng, recipe.budgets, 'scrub'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.55,
    0.65,
    0.95,
    recipe,
  );
  forceVariantsForTile(items, tile.id, 'scrub', MEADOW_SCRUB_VARIANTS, rng);
  placeKind(
    items,
    tile.id,
    'rock',
    budgetCount(rng, recipe.budgets, 'rock'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.4,
    0.7,
    1.15,
    recipe,
  );
  placeKind(
    items,
    tile.id,
    'prop',
    budgetCount(rng, recipe.budgets, 'prop'),
    rng,
    preferredDirs,
    0.15,
    0.9,
    1.15,
    recipe,
  );
}

function placeJungleCanopy(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
): void {
  // Landmarks first so packing palms cannot reject the tile signature props.
  pushLandmark(items, tile.id, 0.22, 0.1, 0.5, 0.55, PROP_COLUMN);
  if (rng() > 0.35) pushLandmark(items, tile.id, -0.2, -0.12, 1.0, 0.5, PROP_CRATE);

  placeKind(
    items,
    tile.id,
    'tree',
    budgetCount(rng, recipe.budgets, 'tree'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.85,
    0.85,
    1.2,
    recipe,
  );
  // Force palm canopy — no temperate oaks in jungle.
  for (const item of items) {
    if (item.kind === 'tree' && item.tileId === tile.id) {
      item.variant = rng() > 0.45 ? TREE_PALM_A : TREE_PALM_B;
    }
  }
  placeKind(
    items,
    tile.id,
    'scrub',
    budgetCount(rng, recipe.budgets, 'scrub'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.65,
    0.8,
    1.25,
    recipe,
  );
  forceVariantsForTile(items, tile.id, 'scrub', MEADOW_SCRUB_VARIANTS, rng);
  placeKind(
    items,
    tile.id,
    'rock',
    budgetCount(rng, recipe.budgets, 'rock'),
    rng,
    preferredDirs,
    0.3,
    0.55,
    0.95,
    recipe,
  );
}

function placeTundraSparse(
  items: DecorInstance[],
  tile: HexTile,
  rng: () => number,
  preferredDirs: number[],
  recipe: BiomeCompositionRecipe,
): void {
  placeKind(
    items,
    tile.id,
    'tree',
    budgetCount(rng, recipe.budgets, 'tree'),
    rng,
    preferredDirs,
    0.62,
    0.75,
    1.1,
    recipe,
  );
  for (const item of items) {
    if (item.kind === 'tree' && item.tileId === tile.id) item.variant = TREE_DARK_PINE;
  }
  placeKind(
    items,
    tile.id,
    'rock',
    budgetCount(rng, recipe.budgets, 'rock'),
    rng,
    preferredDirs,
    0.42,
    0.7,
    1.15,
    recipe,
  );
  placeKind(
    items,
    tile.id,
    'scrub',
    budgetCount(rng, recipe.budgets, 'scrub'),
    rng,
    preferredDirs,
    0.38,
    0.55,
    0.9,
    recipe,
  );
  // Light snow flecks on the open ground between sparse firs.
  const snowN = rngInt(rng, 6, 11);
  for (let i = 0; i < snowN; i++) {
    const a = rng() * Math.PI * 2;
    const r = rngRange(rng, 0.22, 0.72);
    pushDecor(
      items,
      tile.id,
      'scrub',
      Math.cos(a) * r,
      Math.sin(a) * r,
      rng() * Math.PI,
      rngRange(rng, 0.65, 1.05),
      SCRUB_SNOW,
    );
  }
}

/**
 * Natural flora/rocks sit slightly under authored size.
 * Artificial props (fence, well, barrel…) are smaller — those are the “décors”.
 */

export function buildTileDecorations(
  tile: HexTile,
  mapSeed: number,
  neighbors?: NeighborVisualContext,
): DecorInstance[] {
  if (isWaterTerrain(tile.terrain)) return [];
  const recipe = pickRecipe(tile.terrain, visualRngFor(mapSeed, tile.id, 'recipe'));
  if (!recipe) return [];

  const rng = visualRngFor(mapSeed, tile.id, 'decor-h3');
  const items: DecorInstance[] = [];
  const preferredDirs =
    neighbors && neighbors.sameBiomeDirs.length > 0
      ? neighbors.sameBiomeDirs
      : neighbors?.coastDirs ?? [];
  const windRot = rngRange(rng, 0, Math.PI);

  // Desert: tiered wind dunes only.
  if (tile.terrain === 'desert') {
    placeDesertDunes(items, tile, rng, preferredDirs, recipe, windRot);
    if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
    return applyDecorScale(items, tile.terrain);
  }

  // H6 advanced biomes — dedicated diorama recipes.
  if (tile.terrain === 'volcano') {
    placeVolcanoCrater(items, tile, rng, preferredDirs, recipe);
    return items;
  }
  if (tile.terrain === 'goldmine') {
    placeGoldmineShaft(items, tile, rng, preferredDirs, recipe);
    return items;
  }
  if (tile.terrain === 'mountain') {
    placeMountainHero(items, tile, rng, preferredDirs, recipe);
    return items;
  }
  if (tile.terrain === 'swamp') {
    placeSwampReeds(items, tile, rng, preferredDirs, recipe);
    if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
    return applyDecorScale(items, tile.terrain);
  }
  if (tile.terrain === 'glacier') {
    placeGlacierIce(items, tile, rng, preferredDirs, recipe);
    return applyDecorScale(items, tile.terrain);
  }
  if (tile.terrain === 'ruins') {
    placeRuinsOvergrown(items, tile, rng, preferredDirs, recipe);
    if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
    return applyDecorScale(items, tile.terrain);
  }
  if (tile.terrain === 'jungle') {
    placeJungleCanopy(items, tile, rng, preferredDirs, recipe);
    if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
    return applyDecorScale(items, tile.terrain);
  }
  if (tile.terrain === 'tundra') {
    placeTundraSparse(items, tile, rng, preferredDirs, recipe);
    if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
    return applyDecorScale(items, tile.terrain);
  }
  if (tile.terrain === 'forest') {
    placeForestCanopy(items, tile, rng, preferredDirs, recipe, windRot);
    if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
    return applyDecorScale(items, tile.terrain);
  }

  if (tile.terrain === 'plains') {
    const fields = budgetCount(rng, recipe.budgets, 'field');
    placePlainsRows(items, tile, rng, fields, neighbors, recipe);
    // Tiny scrub accents only — wheat owns the tile.
    placeKind(
      items,
      tile.id,
      'scrub',
      budgetCount(rng, recipe.budgets, 'scrub'),
      rng,
      preferredDirs,
      0.75,
      0.55,
      0.85,
      recipe,
    );
    forceVariantsForTile(items, tile.id, 'scrub', MEADOW_SCRUB_VARIANTS, rng);
    if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
    return applyDecorScale(items, tile.terrain);
  }

  const scrubScale: [number, number] =
    tile.terrain === 'pasture' ? [1.0, 1.35] : [0.65, 0.95];
  const hillScale: [number, number] =
    tile.terrain === 'hill' ? [1.05, 1.4] : [0.75, 1.05];
  const duneScale: [number, number] = [0.9, 1.25];
  const treeScale: [number, number] =
    tile.terrain === 'pasture'
      ? [0.55, 0.75]
      : [0.5, 0.75];
  const peakScale: [number, number] = [0.9, 1.1];

  placeKind(
    items,
    tile.id,
    'tree',
    budgetCount(rng, recipe.budgets, 'tree'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.75,
    treeScale[0],
    treeScale[1],
    recipe,
  );
  placeKind(
    items,
    tile.id,
    'scrub',
    budgetCount(rng, recipe.budgets, 'scrub'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.55,
    scrubScale[0],
    scrubScale[1],
    recipe,
  );
  placeKind(
    items,
    tile.id,
    'rock',
    budgetCount(rng, recipe.budgets, 'rock'),
    rng,
    preferredDirs,
    recipe.edgeBias * 0.4,
    tile.terrain === 'hill' ? 0.8 : 0.7,
    tile.terrain === 'hill' ? 1.2 : 1.15,
    recipe,
  );
  placeKind(
    items,
    tile.id,
    'peak',
    budgetCount(rng, recipe.budgets, 'peak'),
    rng,
    preferredDirs,
    0.35,
    peakScale[0],
    peakScale[1],
    recipe,
  );
  placeKind(
    items,
    tile.id,
    'hill',
    budgetCount(rng, recipe.budgets, 'hill'),
    rng,
    preferredDirs,
    0.35,
    hillScale[0],
    hillScale[1],
    recipe,
  );
  placeKind(
    items,
    tile.id,
    'dune',
    budgetCount(rng, recipe.budgets, 'dune'),
    rng,
    preferredDirs,
    0.3,
    duneScale[0],
    duneScale[1],
    recipe,
    windRot,
  );
  if (tile.terrain === 'pasture') {
    forceVariantsForTile(items, tile.id, 'scrub', MEADOW_SCRUB_VARIANTS, rng);
    forceVariantsForTile(items, tile.id, 'tree', TEMPERATE_TREE_VARIANTS, rng);
    placePastureYard(items, tile, rng, recipe);
  } else {
    placeKind(
      items,
      tile.id,
      'prop',
      budgetCount(rng, recipe.budgets, 'prop'),
      rng,
      preferredDirs,
      0.15,
      0.9,
      1.15,
      recipe,
    );
  }

  if (neighbors) placeEdgeAccent(items, tile, neighbors, rng, recipe);
  return applyDecorScale(items, tile.terrain);
}

/** LOD thinning — keep biome-defining silhouettes dense at default camera (LOD1). */
export function filterDecorByLod(
  items: DecorInstance[],
  lod: 0 | 1 | 2,
): DecorInstance[] {
  if (lod <= 0) return items;
  if (lod === 1) {
    return items.filter((item, index) => {
      if (item.kind === 'peak' || item.kind === 'hill' || item.kind === 'prop') return true;
      const key = Math.abs((item.x * 100) | 0) + Math.abs((item.z * 100) | 0) + index;
      const roll = (key % 100) / 100;
      if (item.kind === 'scrub' || item.kind === 'dune' || item.kind === 'field') return roll < 0.65;
      // Strategic tree impostors are a single instanced draw and must retain
      // canopy density; rocks still use the reduced mid-distance budget.
      if (item.kind === 'tree') return true;
      if (item.kind === 'rock') return roll < 0.55;
      return roll < 0.5;
    });
  }
  return items.filter((item, index) => {
    if (item.kind === 'peak' || item.kind === 'hill' || item.kind === 'prop') return true;
    if (item.kind === 'scrub' && item.scale > 1.4) return index % 2 === 0;
    if (item.kind === 'tree' && (index % 2 === 0 || item.scale > 0.9)) return true;
    if (item.kind === 'dune' && item.scale > 1.0) return index % 2 === 0;
    if (item.kind === 'rock' && item.scale > 1.0) return index % 2 === 0;
    return false;
  });
}

export function buildMapDecorations(tiles: HexTile[], mapSeed: number): DecorInstance[] {
  const neighbors = buildNeighborMap(tiles);
  const all: DecorInstance[] = [];
  for (const tile of tiles) {
    all.push(...buildTileDecorations(tile, mapSeed, neighbors.get(tile.id)));
  }
  return all;
}

export {
  DECOR_LOW_CLEAR,
  DECOR_TALL_CLEAR,
} from './composition/BiomeCompositionRecipe';
