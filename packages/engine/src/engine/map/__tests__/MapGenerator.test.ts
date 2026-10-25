import { describe, expect, it } from 'vitest';
import { buildGameConfigFromPreset } from '../../../core/presets';
import type { MapSize } from '../../../types/game';
import {
  CLASSIC_DICE_BAG,
  CLASSIC_TERRAIN_BAG_WEIGHTS,
  composeScaledClassicTerrainTargets,
  composeScaledDicePool,
  getBaseProduction,
  MapGenerator,
  mapHasRedNumberConflict,
} from '../MapGenerator';

const NO_DICE = new Set(['desert', 'ocean', 'coast', 'glacier']);
const ALL_TOKEN_VALUES = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const CLASSIC = ['plains', 'forest', 'mountain', 'hill', 'pasture'] as const;

function generate(mapSize: MapSize, mapSeed: number) {
  const config = buildGameConfigFromPreset('catanx', {
    mapSize,
    mapSeed,
    playerCount: 4,
  });
  return new MapGenerator(config).generate();
}

describe('composeScaledDicePool', () => {
  it('returns exactly count tokens with no 7', () => {
    for (const count of [0, 5, 10, 18, 37, 54, 100]) {
      const pool = composeScaledDicePool(count);
      expect(pool).toHaveLength(count);
      expect(pool.every((v) => v !== 7 && v >= 2 && v <= 12)).toBe(true);
    }
  });

  it('includes every classic value when count >= 10', () => {
    for (const count of [10, 18, 27, 36, 54, 90]) {
      const pool = composeScaledDicePool(count);
      const present = new Set(pool);
      for (const value of ALL_TOKEN_VALUES) {
        expect(present.has(value)).toBe(true);
      }
    }
  });

  it('matches classic bag proportions at multiples of 18', () => {
    const classicCounts = new Map<number, number>();
    for (const v of CLASSIC_DICE_BAG) {
      classicCounts.set(v, (classicCounts.get(v) ?? 0) + 1);
    }

    for (const bags of [1, 2, 3, 5]) {
      const pool = composeScaledDicePool(bags * 18);
      const counts = new Map<number, number>();
      for (const v of pool) counts.set(v, (counts.get(v) ?? 0) + 1);
      for (const [value, weight] of classicCounts) {
        expect(counts.get(value)).toBe(weight * bags);
      }
    }
  });
});

describe('composeScaledClassicTerrainTargets', () => {
  it('sums to count and covers all biomes when count >= 5', () => {
    for (const count of [5, 10, 18, 27, 36, 54, 90]) {
      const targets = composeScaledClassicTerrainTargets(count);
      let sum = 0;
      for (const terrain of CLASSIC) {
        const n = targets.get(terrain) ?? 0;
        expect(n).toBeGreaterThanOrEqual(1);
        sum += n;
      }
      expect(sum).toBe(count);
    }
  });

  it('matches classic 4:4:4:3:3 at multiples of 18', () => {
    for (const bags of [1, 2, 3, 5]) {
      const targets = composeScaledClassicTerrainTargets(bags * 18);
      for (const { terrain, weight } of CLASSIC_TERRAIN_BAG_WEIGHTS) {
        expect(targets.get(terrain)).toBe(weight * bags);
      }
    }
  });
});

describe('MapGenerator — uniformity & tokens', () => {
  const sizes: MapSize[] = ['small', 'medium', 'large', 'huge'];
  const seeds = [42, 1001, 7777];

  it('gives every productive tile a token and never places 7', () => {
    for (const mapSize of sizes) {
      for (const seed of seeds) {
        const tiles = generate(mapSize, seed);
        for (const tile of tiles.values()) {
          if (NO_DICE.has(tile.terrain)) {
            expect(tile.diceValue).toBeNull();
          } else {
            expect(tile.diceValue).not.toBeNull();
            expect(tile.diceValue).not.toBe(7);
            expect(tile.diceValue!).toBeGreaterThanOrEqual(2);
            expect(tile.diceValue!).toBeLessThanOrEqual(12);
          }
        }
      }
    }
  });

  it('includes all token values 2–12 (except 7) on medium+ maps', () => {
    for (const mapSize of ['medium', 'large', 'huge'] as MapSize[]) {
      for (const seed of seeds) {
        const tiles = generate(mapSize, seed);
        const values = new Set(
          [...tiles.values()].map((t) => t.diceValue).filter((v): v is number => v !== null),
        );
        for (const value of ALL_TOKEN_VALUES) {
          expect(values.has(value)).toBe(true);
        }
      }
    }
  });

  it('ne place jamais deux jetons 6/8 adjacents (règle Catan variable)', () => {
    const checkSizes: MapSize[] = ['tiny', 'small', 'medium', 'large', 'huge'];
    const checkSeeds = [42, 1001, 7777, 13, 99, 2024, 5555];
    for (const mapSize of checkSizes) {
      for (const seed of checkSeeds) {
        const tiles = generate(mapSize, seed);
        expect(mapHasRedNumberConflict(tiles)).toBe(false);
      }
    }
  });

  it('keeps interior land ratio roughly stable across sizes', () => {
    for (const mapSize of sizes) {
      const ratios: number[] = [];
      for (const seed of seeds) {
        const tiles = generate(mapSize, seed);
        const all = [...tiles.values()];
        const radius = Math.max(
          ...all.map((t) => Math.max(Math.abs(t.coord.q), Math.abs(t.coord.r), Math.abs(t.coord.s))),
        );
        const interior = all.filter((t) => {
          const dist = Math.max(Math.abs(t.coord.q), Math.abs(t.coord.r), Math.abs(t.coord.s));
          return dist < radius;
        });
        const land = interior.filter((t) => !['ocean', 'coast'].includes(t.terrain));
        ratios.push(land.length / Math.max(1, interior.length));
      }
      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      expect(avg).toBeGreaterThan(0.55);
      expect(avg).toBeLessThan(0.9);
      const spread = Math.max(...ratios) - Math.min(...ratios);
      expect(spread).toBeLessThan(0.25);
    }
  });

  it('keeps classic resource biomes present on every size', () => {
    for (const mapSize of sizes) {
      for (const seed of seeds) {
        const tiles = generate(mapSize, seed);
        const terrains = new Set([...tiles.values()].map((t) => t.terrain));
        for (const terrain of CLASSIC) {
          expect(terrains.has(terrain)).toBe(true);
        }
      }
    }
  });

  it('matches Catan 4:4:4:3:3 ratios on classic resource tiles', () => {
    for (const mapSize of sizes) {
      for (const seed of seeds) {
        const tiles = generate(mapSize, seed);
        const classicTiles = [...tiles.values()].filter((t) =>
          (CLASSIC as readonly string[]).includes(t.terrain),
        );
        const targets = composeScaledClassicTerrainTargets(classicTiles.length);
        const counts = new Map<string, number>();
        for (const t of classicTiles) {
          counts.set(t.terrain, (counts.get(t.terrain) ?? 0) + 1);
        }
        for (const terrain of CLASSIC) {
          expect(counts.get(terrain) ?? 0).toBe(targets.get(terrain) ?? 0);
        }
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generate('medium', 12345);
    const b = generate('medium', 12345);
    expect(a.size).toBe(b.size);
    for (const [id, tile] of a) {
      const other = b.get(id)!;
      expect(other.terrain).toBe(tile.terrain);
      expect(other.diceValue).toBe(tile.diceValue);
    }
  });
});

describe('getBaseProduction — biomes avancés → classiques', () => {
  const CLASSIC_FIVE = new Set(['wood', 'clay', 'wheat', 'sheep', 'ore']);

  it('ne produit que des ressources Catan classiques', () => {
    const cases: Array<[string, Record<string, number>]> = [
      ['plains', { wheat: 1 }],
      ['forest', { wood: 1 }],
      ['pasture', { sheep: 1 }],
      ['jungle', { wood: 1 }],
      ['tundra', { sheep: 1 }],
      ['swamp', { clay: 1 }],
      ['volcano', { ore: 1 }],
      ['goldmine', { ore: 1 }],
      ['ruins', { ore: 1 }],
      ['river', { wheat: 1 }],
      ['lake', { wheat: 1 }],
      ['sacred', {}],
      ['glacier', {}],
      ['coast', {}],
      ['mountain', { ore: 1 }],
      ['hill', { clay: 1 }],
    ];
    for (const [terrain, expected] of cases) {
      const prod = getBaseProduction(terrain as import('../../../types/hex').TerrainType);
      expect(prod).toEqual(expected);
      for (const key of Object.keys(prod)) {
        expect(CLASSIC_FIVE.has(key)).toBe(true);
      }
    }
  });
});

describe('ports générés', () => {
  it('ne propose jamais or / poisson / épices (non produits)', () => {
    const allowed = new Set([
      'generic_3:1',
      'wood_2:1',
      'ore_2:1',
      'wheat_2:1',
      'sheep_2:1',
      'clay_2:1',
    ]);
    for (const mapSize of ['tiny', 'small', 'medium'] as MapSize[]) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const tiles = generate(mapSize, seed);
        for (const tile of tiles.values()) {
          if (!tile.port) continue;
          expect(allowed.has(tile.port)).toBe(true);
        }
      }
    }
  });
});
