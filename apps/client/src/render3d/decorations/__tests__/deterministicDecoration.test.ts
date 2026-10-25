import { describe, expect, it } from 'vitest';
import type { HexTile } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import {
  buildMapDecorations,
  buildTileDecorations,
  DECOR_TALL_CLEAR,
  filterDecorByLod,
  isInsideLowClearance,
  isInsideTokenClearance,
  isNearHexVertex,
  isWaterTerrain,
} from '../deterministicDecoration';
import { buildNeighborVisualContext } from '../composition/NeighborVisualContext';
import { recipesForTerrain } from '../composition/BiomeCompositionRecipe';

function fakeTile(partial: Partial<HexTile> & Pick<HexTile, 'id' | 'terrain' | 'coord'>): HexTile {
  return {
    elevation: 'lowland',
    climate: 'temperate',
    diceValue: 6,
    baseProduction: {},
    modifiers: [],
    features: [],
    owner: null,
    building: null,
    units: [],
    robber: false,
    port: null,
    ...partial,
  } as HexTile;
}

describe('deterministicDecoration H3', () => {
  it('produces identical decorations for the same seed', () => {
    const tile = fakeTile({
      id: '0,0',
      terrain: 'forest',
      coord: { q: 0, r: 0, s: 0 },
    });
    const a = buildTileDecorations(tile, 1337);
    const b = buildTileDecorations(tile, 1337);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(8);
  });

  it('keeps tall props outside the token disk', () => {
    const tile = fakeTile({
      id: '1,0',
      terrain: 'forest',
      coord: { q: 1, r: 0, s: -1 },
    });
    const items = buildTileDecorations(tile, 42);
    for (const item of items) {
      if (item.kind === 'tree' || item.kind === 'prop') {
        expect(isInsideTokenClearance(item.x, item.z)).toBe(false);
        const r2 = item.x * item.x + item.z * item.z;
        expect(r2).toBeGreaterThanOrEqual(DECOR_TALL_CLEAR * DECOR_TALL_CLEAR - 1e-9);
      }
    }
  });

  it('keeps tall props off hex vertices', () => {
    const tile = fakeTile({
      id: '2,0',
      terrain: 'forest',
      coord: { q: 2, r: 0, s: -2 },
    });
    const items = buildTileDecorations(tile, 11);
    for (const item of items) {
      if (item.kind === 'tree' || item.kind === 'prop' || item.kind === 'peak') {
        expect(isNearHexVertex(item.x, item.z)).toBe(false);
      }
    }
  });

  it('allows low scrub closer than tall clearance', () => {
    const tile = fakeTile({
      id: 'pasture',
      terrain: 'pasture',
      coord: { q: 0, r: 1, s: -1 },
    });
    const items = buildTileDecorations(tile, 99);
    const scrub = items.filter((i) => i.kind === 'scrub');
    expect(scrub.length).toBeGreaterThan(0);
    // None of the low props may sit inside the hard low disk.
    for (const item of scrub) {
      expect(isInsideLowClearance(item.x, item.z)).toBe(false);
    }
  });

  it('skips water tiles', () => {
    const ocean = fakeTile({
      id: 'ocean',
      terrain: 'ocean',
      coord: { q: 2, r: 0, s: -2 },
      diceValue: null,
    });
    expect(buildTileDecorations(ocean, 1)).toEqual([]);
    expect(isWaterTerrain('ocean')).toBe(true);
  });

  it('aligns plains field strips to a shared rotation', () => {
    const tile = fakeTile({
      id: 'plains',
      terrain: 'plains',
      coord: { q: 0, r: 1, s: -1 },
    });
    const items = buildTileDecorations(tile, 9);
    const fields = items.filter((i) => i.kind === 'field');
    expect(fields.length).toBeGreaterThan(20);
    const rot = fields[0]!.rotation;
    expect(fields.every((i) => Math.abs(i.rotation - rot) < 0.2)).toBe(true);
  });

  it('thins aggressively at LOD2', () => {
    const tiles = [
      fakeTile({ id: 'a', terrain: 'forest', coord: { q: 0, r: 0, s: 0 } }),
      fakeTile({ id: 'b', terrain: 'mountain', coord: { q: 1, r: 0, s: -1 } }),
    ];
    const all = buildMapDecorations(tiles, 7);
    const lod2 = filterDecorByLod(all, 2);
    expect(lod2.length).toBeLessThan(all.length * 0.65);
    expect(lod2.some((i) => i.kind === 'peak' || i.kind === 'tree')).toBe(true);
  });

  it('places a single hero mountain peak', () => {
    const items = buildTileDecorations(
      fakeTile({ id: 'm', terrain: 'mountain', coord: { q: 0, r: 0, s: 0 }, diceValue: 8 }),
      9,
    );
    const peaks = items.filter((i) => i.kind === 'peak');
    expect(peaks).toHaveLength(1);
    expect(peaks[0]!.scale).toBeGreaterThanOrEqual(1.0);
    expect(peaks[0]!.scale).toBeLessThanOrEqual(1.05);
    expect(items.filter((i) => i.kind === 'rock')).toHaveLength(0);
  });

  it('picks distinct mountain silhouettes across seeds', () => {
    const variants = new Set<number>();
    for (let seed = 0; seed < 24; seed++) {
      const items = buildTileDecorations(
        fakeTile({ id: `m${seed}`, terrain: 'mountain', coord: { q: 0, r: 0, s: 0 }, diceValue: 8 }),
        seed,
      );
      const peak = items.find((i) => i.kind === 'peak');
      if (peak) variants.add(peak.variant % 3);
    }
    expect(variants.size).toBeGreaterThanOrEqual(2);
  });

  it('keeps desert free of trees and full of dunes', () => {
    const tile = fakeTile({
      id: 'desert',
      terrain: 'desert',
      coord: { q: 0, r: 0, s: 0 },
      diceValue: null,
    });
    const items = buildTileDecorations(tile, 21);
    expect(items.some((i) => i.kind === 'tree')).toBe(false);
    expect(items.some((i) => i.kind === 'scrub')).toBe(false);
    expect(items.filter((i) => i.kind === 'dune').length).toBeGreaterThan(20);
    expect(items.some((i) => i.kind === 'rock')).toBe(false);
  });

  it('exposes classic composition recipes', () => {
    expect(recipesForTerrain('forest').length).toBeGreaterThan(0);
    expect(recipesForTerrain('plains')[0]?.budgets.field?.[0]).toBeGreaterThanOrEqual(24);
    expect(recipesForTerrain('desert')[0]?.budgets.dune?.[0]).toBeGreaterThanOrEqual(18);
    expect(recipesForTerrain('mountain')[0]?.budgets.peak?.[1]).toBe(1);
    expect(recipesForTerrain('pasture')[0]?.budgets.tree?.[0]).toBeGreaterThanOrEqual(2);
    expect(recipesForTerrain('hill')[0]?.budgets.rock?.[0]).toBeGreaterThanOrEqual(12);
    // Pasture keeps a hedgerow, not a thicket. The budget was 18-26 bushes per
    // tile, which read as scrubland — grazing animals would have eaten them.
    expect(recipesForTerrain('pasture')[0]?.budgets.scrub?.[0]).toBeGreaterThanOrEqual(1);
  });

  it('exposes dedicated H6 advanced biome recipes', () => {
    expect(recipesForTerrain('jungle')[0]?.id).toBe('jungle_canopy');
    expect(recipesForTerrain('swamp')[0]?.id).toBe('swamp_reeds');
    expect(recipesForTerrain('volcano')[0]?.id).toBe('volcano_crater');
    expect(recipesForTerrain('tundra')[0]?.id).toBe('tundra_sparse');
    expect(recipesForTerrain('glacier')[0]?.id).toBe('glacier_ice');
    expect(recipesForTerrain('ruins')[0]?.id).toBe('ruins_overgrown');
    expect(recipesForTerrain('sacred')[0]?.id).toBe('incomplete_fallback');
    expect(recipesForTerrain('goldmine')[0]?.id).toBe('goldmine_shaft');
    expect(recipesForTerrain('ocean')).toEqual([]);
    expect(recipesForTerrain('lake')).toEqual([]);
    expect(recipesForTerrain('river')).toEqual([]);
  });

  it('builds dense jungle and swamp landmarks', () => {
    const jungle = buildTileDecorations(
      fakeTile({ id: 'j', terrain: 'jungle', coord: { q: 0, r: 0, s: 0 } }),
      99,
    );
    expect(jungle.filter((i) => i.kind === 'tree').length).toBeGreaterThanOrEqual(20);
    expect(jungle.some((i) => i.kind === 'prop')).toBe(true);

    const swamp = buildTileDecorations(
      fakeTile({ id: 's', terrain: 'swamp', coord: { q: 1, r: 0, s: -1 } }),
      99,
    );
    expect(swamp.filter((i) => i.kind === 'scrub').length).toBeGreaterThanOrEqual(10);
  });

  it('places ice and meltwater on glaciers', () => {
    const glacier = buildTileDecorations(
      fakeTile({ id: 'g', terrain: 'glacier', coord: { q: 0, r: 1, s: -1 } }),
      7,
    );
    expect(glacier.some((i) => i.kind === 'peak')).toBe(false);
    expect(glacier.some((i) => i.kind === 'rock')).toBe(true);
    expect(glacier.filter((i) => i.kind === 'rock').every((i) => i.variant === 4)).toBe(true);
    expect(glacier.some((i) => i.kind === 'scrub' && i.variant === 7)).toBe(true);
  });

  it('keeps volcano as a lava cone with lava props', () => {
    const volcano = buildTileDecorations(
      fakeTile({ id: 'v', terrain: 'volcano', coord: { q: -1, r: 0, s: 1 } }),
      12,
    );
    expect(volcano.some((i) => i.kind === 'peak')).toBe(true);
    expect(volcano.filter((i) => i.kind === 'rock').every((i) => i.variant === 5)).toBe(true);
    expect(volcano.some((i) => i.kind === 'prop' && i.variant === 10)).toBe(true);
  });

  it('uses temperate trees in forest and palms only in jungle', () => {
    const forest = buildTileDecorations(
      fakeTile({ id: 'f', terrain: 'forest', coord: { q: 0, r: 0, s: 0 } }),
      11,
    );
    const forestTrees = forest.filter((i) => i.kind === 'tree');
    expect(forestTrees.length).toBeGreaterThanOrEqual(12);
    expect(forestTrees.every((i) => i.variant >= 0 && i.variant <= 5)).toBe(true);
    expect(forestTrees.some((i) => i.variant === 6 || i.variant === 7)).toBe(false);

    const jungle = buildTileDecorations(
      fakeTile({ id: 'j2', terrain: 'jungle', coord: { q: 3, r: 0, s: -3 } }),
      5,
    );
    const jungleTrees = jungle.filter((i) => i.kind === 'tree');
    expect(jungleTrees.length).toBeGreaterThanOrEqual(20);
    expect(jungleTrees.every((i) => i.variant === 6 || i.variant === 7)).toBe(true);
  });

  it('keeps meadow scrub on pastures (no snow or melt pools)', () => {
    const pasture = buildTileDecorations(
      fakeTile({ id: 'p', terrain: 'pasture', coord: { q: 2, r: -1, s: -1 } }),
      4,
    );
    const scrubs = pasture.filter((i) => i.kind === 'scrub');
    expect(scrubs.length).toBeGreaterThan(0);
    // The invariant this test exists for: pasture scrub must come from the
    // meadow variants, never the tundra snow patches or glacier melt pools.
    expect(scrubs.every((i) => i.variant >= 0 && i.variant <= 3)).toBe(true);
  });

  it('uses sparse dark pines on tundra', () => {
    const tundra = buildTileDecorations(
      fakeTile({ id: 't', terrain: 'tundra', coord: { q: 0, r: 2, s: -2 } }),
      5,
    );
    const tundraTrees = tundra.filter((i) => i.kind === 'tree');
    expect(tundraTrees.length).toBeGreaterThanOrEqual(8);
    expect(tundraTrees.length).toBeLessThanOrEqual(18);
    expect(tundraTrees.every((i) => i.variant === 5)).toBe(true);
  });

  it('puts no decorations on lakes', () => {
    const lake = buildTileDecorations(
      fakeTile({ id: 'lake', terrain: 'lake', coord: { q: 0, r: 0, s: 0 } }),
      1,
    );
    expect(lake).toEqual([]);
  });

  it('covers glaciers with snow patches', () => {
    const glacier = buildTileDecorations(
      fakeTile({ id: 'g2', terrain: 'glacier', coord: { q: 1, r: 1, s: -2 } }),
      3,
    );
    expect(glacier.some((i) => i.kind === 'scrub' && i.variant === 6)).toBe(true);
  });

  it('builds neighbor visual context', () => {
    const forest = fakeTile({ id: hexToId({ q: 0, r: 0, s: 0 }), terrain: 'forest', coord: { q: 0, r: 0, s: 0 } });
    const map = new Map<string, HexTile>([[forest.id, forest]]);
    for (let d = 0; d < 6; d++) {
      const n = hexNeighbor(forest.coord, d as 0 | 1 | 2 | 3 | 4 | 5);
      const id = hexToId(n);
      map.set(id, fakeTile({ id, terrain: 'forest', coord: n }));
    }
    const ctx = buildNeighborVisualContext(forest, map);
    expect(ctx.edges).toHaveLength(6);
    expect(ctx.sameBiomeDirs.length).toBe(6);
    expect(ctx.coastDirs.length).toBe(0);
  });

  it('keeps tall decor spaced on dense forest tiles', () => {
    const forest = buildTileDecorations(
      fakeTile({ id: 'f', terrain: 'forest', coord: { q: 0, r: 0, s: 0 } }),
      42,
    );
    const tall = forest.filter(
      (i) => i.kind === 'tree' || i.kind === 'prop' || i.kind === 'peak' || i.kind === 'hill',
    );
    for (let i = 0; i < tall.length; i++) {
      for (let j = i + 1; j < tall.length; j++) {
        const a = tall[i]!;
        const b = tall[j]!;
        if (a.tileId !== b.tileId) continue;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(0.14 * 0.14 - 1e-6);
      }
    }
  });

  it('keeps the instanced canopy while thinning secondary LOD1 decor', () => {
    const tiles = [fakeTile({ id: 'j', terrain: 'jungle', coord: { q: 0, r: 0, s: 0 } })];
    const all = buildMapDecorations(tiles, 3);
    const lod1 = filterDecorByLod(all, 1);
    expect(lod1.filter((item) => item.kind === 'tree')).toHaveLength(
      all.filter((item) => item.kind === 'tree').length,
    );
    expect(lod1.filter((item) => item.kind !== 'tree').length).toBeLessThan(
      all.filter((item) => item.kind !== 'tree').length,
    );
    expect(lod1.length).toBeLessThan(all.length);
  });
});
