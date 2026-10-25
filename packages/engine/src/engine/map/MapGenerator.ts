// ============================================================
// MapGenerator — Génération procédurale de cartes hexagonales
// Utilise du bruit de Perlin simplifié + règles de placement
// ============================================================

import {
  HexTile,
  TerrainType,
  ElevationType,
  ClimateZone,
  TileFeature,
  PortType,
  normalizePortType,
} from '../../types/hex';
import { ResourceBundle, ResourceType } from '../../types/resources';
import { GameConfig, MapSize } from '../../types/game';
import { hexSpiral, hexToId, hexRing, hexAllNeighbors } from '../hex/HexMath';
import { CubeCoord } from '../../types/hex';

// ============================================================
// CONFIG PAR TAILLE
// ============================================================

const MAP_SIZE_CONFIG: Record<MapSize, { radius: number; playerSpacing: number }> = {
  tiny: { radius: 2, playerSpacing: 2 }, // 19 tuiles
  small: { radius: 3, playerSpacing: 3 }, // 37 tuiles
  medium: { radius: 4, playerSpacing: 3 }, // 61 tuiles
  large: { radius: 5, playerSpacing: 4 }, // 91 tuiles
  huge: { radius: 6, playerSpacing: 4 }, // 127 tuiles
  epic: { radius: 8, playerSpacing: 5 }, // 217 tuiles
};

// ============================================================
// BRUIT DE PERLIN SIMPLE (déterministe via seed)
// ============================================================

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ============================================================
// BRUIT SPATIAL DÃ‰TERMINISTE (Value Noise)
// BUG FIX: l'ancienne version appelait rng.next() 4x sans lien avec les coords
// → les mêmes (q,r) donnaient des valeurs différentes selon l'ordre d'appel
// La nouvelle version utilise un hash de coordonnées : reproductible par (q,r)
// ============================================================

function intHash(n: number): number {
  // Finalizer de Murmur3 — distribue bien les bits
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return n;
}

function coordHash(q: number, r: number, seed: number): number {
  // Hash 2D déterministe : même (q,r,seed) → même [0,1)
  const hq = intHash((q + 100000) ^ (seed * 73856093));
  const hr = intHash((r + 100000) ^ (seed * 19349663));
  return (intHash(hq ^ hr) >>> 0) / 0xffffffff;
}

function smoothNoise(q: number, r: number, scale: number, seed: number): number {
  const x = q / scale;
  const y = r / scale;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  // Valeurs déterministes aux 4 coins de la cellule
  const a = coordHash(xi, yi, seed);
  const b = coordHash(xi + 1, yi, seed);
  const c = coordHash(xi, yi + 1, seed);
  const d = coordHash(xi + 1, yi + 1, seed);

  // Interpolation smoothstep (S-curve)
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ============================================================
// DISTRIBUTION TERRAIN
// ============================================================

interface TerrainDistribution {
  terrain: TerrainType;
  weight: number;
  minElevation: ElevationType;
  maxElevation: ElevationType;
  climates: ClimateZone[];
  nearWater?: boolean; // préfère être proche de l'eau
  nearMountain?: boolean; // préfère être proche des montagnes
}

const TERRAIN_DISTRIBUTIONS: TerrainDistribution[] = [
  {
    terrain: 'plains',
    weight: 4,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['temperate', 'mediterranean'],
  },
  {
    terrain: 'forest',
    weight: 4,
    minElevation: 'lowland',
    maxElevation: 'highland',
    climates: ['temperate', 'arctic'],
  },
  {
    terrain: 'mountain',
    weight: 3,
    minElevation: 'highland',
    maxElevation: 'peak',
    climates: ['temperate', 'arctic', 'arid'],
  },
  {
    terrain: 'hill',
    weight: 3,
    minElevation: 'midland',
    maxElevation: 'highland',
    climates: ['temperate', 'mediterranean', 'arid'],
  },
  {
    terrain: 'pasture',
    weight: 4,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['temperate', 'mediterranean'],
  },
  {
    terrain: 'desert',
    weight: 4,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['arid'],
  },
  {
    terrain: 'coast',
    weight: 8,
    minElevation: 'sea',
    maxElevation: 'lowland',
    climates: ['temperate', 'tropical', 'mediterranean'],
    nearWater: true,
  },
  {
    terrain: 'ocean',
    weight: 5,
    minElevation: 'sea',
    maxElevation: 'sea',
    climates: ['temperate', 'tropical', 'arctic'],
  },
  {
    terrain: 'river',
    weight: 6,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['temperate', 'tropical'],
    nearWater: true,
  },
  {
    terrain: 'swamp',
    weight: 4,
    minElevation: 'sea',
    maxElevation: 'lowland',
    climates: ['tropical', 'temperate'],
    nearWater: true,
  },
  {
    terrain: 'volcano',
    weight: 2,
    minElevation: 'highland',
    maxElevation: 'peak',
    climates: ['tropical', 'mediterranean'],
    nearMountain: true,
  },
  {
    terrain: 'tundra',
    weight: 5,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['arctic'],
  },
  {
    terrain: 'jungle',
    weight: 6,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['tropical'],
  },
  {
    terrain: 'goldmine',
    weight: 2,
    minElevation: 'midland',
    maxElevation: 'highland',
    climates: ['arid', 'temperate'],
    nearMountain: true,
  },
  {
    terrain: 'sacred',
    weight: 2,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['temperate', 'tropical', 'mediterranean'],
  },
  {
    terrain: 'ruins',
    weight: 2,
    minElevation: 'lowland',
    maxElevation: 'highland',
    climates: ['arid', 'temperate', 'mediterranean'],
  },
  {
    terrain: 'glacier',
    weight: 3,
    minElevation: 'highland',
    maxElevation: 'peak',
    climates: ['arctic'],
  },
  {
    terrain: 'lake',
    weight: 4,
    minElevation: 'lowland',
    maxElevation: 'midland',
    climates: ['temperate', 'arctic'],
    nearWater: true,
  },
];

// ============================================================
// PRODUCTION DE BASE PAR TERRAIN
// ============================================================

/**
 * Production d’une tuile au lancer de dés.
 * Biomes avancés → ressource classique thématique (économie Catan jouable
 * sans industrie ; aligné sur docs/SEASONS_SYSTEM_PLAN.md §8.3).
 */
/** Production de base style Catan : 1 ressource / hex productif (colonie ×1, ville ×2). */
export function getBaseProduction(terrain: TerrainType): ResourceBundle {
  const productions: Record<TerrainType, ResourceBundle> = {
    plains: { wheat: 1 },
    forest: { wood: 1 },
    mountain: { ore: 1 },
    hill: { clay: 1 },
    pasture: { sheep: 1 },
    desert: {},
    coast: {},
    ocean: {},
    // Vallées fertiles / plans d’eau → blé
    river: { wheat: 1 },
    lake: { wheat: 1 },
    // Biomes avancés (même rendement 1:1)
    swamp: { clay: 1 },
    volcano: { ore: 1 },
    tundra: { sheep: 1 },
    jungle: { wood: 1 },
    goldmine: { ore: 1 },
    sacred: {},
    ruins: { ore: 1 },
    glacier: {},
  };
  return { ...(productions[terrain] ?? {}) };
}

// ============================================================
// VALEURS DE DÉS ÉQUILIBRÉES (sac classique Catan, sans 7)
// ============================================================

/** Sac de 18 jetons classiques — proportions de référence pour tout agrandissement. */
export const CLASSIC_DICE_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] as const;

/** True si un 6 ou 8 est adjacent à un autre 6/8 (règle Catan variable). */
export function mapHasRedNumberConflict(tiles: Map<string, HexTile>): boolean {
  for (const tile of tiles.values()) {
    if (tile.diceValue !== 6 && tile.diceValue !== 8) continue;
    for (const neighborCoord of hexAllNeighbors(tile.coord)) {
      const neighbor = tiles.get(hexToId(neighborCoord));
      if (!neighbor) continue;
      if (neighbor.diceValue === 6 || neighbor.diceValue === 8) return true;
    }
  }
  return false;
}

const DICE_VALUE_WEIGHTS: ReadonlyArray<{ value: number; weight: number }> = [
  { value: 2, weight: 1 },
  { value: 3, weight: 2 },
  { value: 4, weight: 2 },
  { value: 5, weight: 2 },
  { value: 6, weight: 2 },
  { value: 8, weight: 2 },
  { value: 9, weight: 2 },
  { value: 10, weight: 2 },
  { value: 11, weight: 2 },
  { value: 12, weight: 1 },
];

const CLASSIC_DICE_BAG_SIZE = CLASSIC_DICE_BAG.length;
const UNIQUE_DICE_VALUES = DICE_VALUE_WEIGHTS.map((w) => w.value);

const NO_DICE_TERRAINS: TerrainType[] = ['desert', 'ocean', 'coast', 'glacier'];

/** Fraction cible de terre dans l’intérieur (hors anneau océan forcé). */
const TARGET_INTERIOR_LAND_RATIO = 0.72;

/** Biomes de production classiques à équilibrer entre eux. */
const CLASSIC_RESOURCE_TERRAINS: TerrainType[] = [
  'plains',
  'forest',
  'mountain',
  'hill',
  'pasture',
];

/**
 * Sac terrain Catan (hors désert) — proportions 4:4:4:3:3
 * plains / forest / pasture / hill / mountain.
 */
export const CLASSIC_TERRAIN_BAG_WEIGHTS: ReadonlyArray<{
  terrain: TerrainType;
  weight: number;
}> = [
  { terrain: 'plains', weight: 4 },
  { terrain: 'forest', weight: 4 },
  { terrain: 'pasture', weight: 4 },
  { terrain: 'hill', weight: 3 },
  { terrain: 'mountain', weight: 3 },
];

const CLASSIC_TERRAIN_BAG_SIZE = CLASSIC_TERRAIN_BAG_WEIGHTS.reduce((s, w) => s + w.weight, 0);

/**
 * Cibles de compte par biome classique, scalées au nombre de tuiles
 * (méthode des plus grands restes, comme le sac de dés).
 */
export function composeScaledClassicTerrainTargets(count: number): Map<TerrainType, number> {
  const targets = new Map<TerrainType, number>();
  if (count <= 0) return targets;

  if (count < CLASSIC_TERRAIN_BAG_WEIGHTS.length) {
    // Petit plateau : une de chaque jusqu’à épuisement, ordre du sac.
    for (let i = 0; i < count; i++) {
      const terrain = CLASSIC_TERRAIN_BAG_WEIGHTS[i]!.terrain;
      targets.set(terrain, (targets.get(terrain) ?? 0) + 1);
    }
    return targets;
  }

  const parts = CLASSIC_TERRAIN_BAG_WEIGHTS.map((w) => {
    const exact = (w.weight / CLASSIC_TERRAIN_BAG_SIZE) * count;
    return {
      terrain: w.terrain,
      count: Math.floor(exact),
      frac: exact - Math.floor(exact),
    };
  });

  const assigned = parts.reduce((sum, p) => sum + p.count, 0);
  const remaining = count - assigned;

  const order = [...parts].sort((a, b) => b.frac - a.frac || a.terrain.localeCompare(b.terrain));
  for (let i = 0; i < remaining; i++) {
    order[i]!.count += 1;
  }

  // Garantir ≥1 de chaque biome dès que count ≥ 5.
  if (count >= CLASSIC_TERRAIN_BAG_WEIGHTS.length) {
    for (const part of parts) {
      if (part.count > 0) continue;
      const donor = parts.reduce((best, p) => (p.count > best.count ? p : best));
      if (donor.count <= 1) continue;
      donor.count -= 1;
      part.count += 1;
    }
  }

  for (const part of parts) targets.set(part.terrain, part.count);
  return targets;
}

function needsProductionToken(terrain: TerrainType): boolean {
  return !NO_DICE_TERRAINS.includes(terrain);
}

/**
 * Compose un pool de exactement `count` jetons aux proportions du sac classique.
 * - count ≥ 10 : chaque valeur 2–12 (sauf 7) apparaît au moins une fois.
 * - count ≥ 18 : sacs complets + reste réparti (méthode des plus grands restes).
 */
export function composeScaledDicePool(count: number): number[] {
  if (count <= 0) return [];

  if (count < UNIQUE_DICE_VALUES.length) {
    // Petit plateau : échantillonner le sac mélangé de façon déterministe par index.
    const pool: number[] = [];
    let bag = [...CLASSIC_DICE_BAG];
    while (pool.length < count) {
      if (bag.length === 0) bag = [...CLASSIC_DICE_BAG];
      pool.push(bag.shift()!);
    }
    return pool;
  }

  const exact = DICE_VALUE_WEIGHTS.map((w) => ({
    value: w.value,
    exact: (w.weight / CLASSIC_DICE_BAG_SIZE) * count,
  }));

  const parts = exact.map((e) => ({
    value: e.value,
    count: Math.floor(e.exact),
    frac: e.exact - Math.floor(e.exact),
  }));

  let assigned = parts.reduce((sum, p) => sum + p.count, 0);
  let remaining = count - assigned;

  // Plus grands restes ; priorité aux 2/12 manquants pour ne jamais les perdre.
  const order = [...parts].sort((a, b) => {
    const aRare = (a.value === 2 || a.value === 12) && a.count === 0 ? 1 : 0;
    const bRare = (b.value === 2 || b.value === 12) && b.count === 0 ? 1 : 0;
    if (aRare !== bRare) return bRare - aRare;
    return b.frac - a.frac || a.value - b.value;
  });

  for (let i = 0; i < remaining; i++) {
    const pick = order[i]!;
    const target = parts.find((p) => p.value === pick.value)!;
    target.count += 1;
  }

  // Garantir une occurrence de chaque valeur si le pool est assez grand.
  if (count >= UNIQUE_DICE_VALUES.length) {
    for (const value of UNIQUE_DICE_VALUES) {
      const part = parts.find((p) => p.value === value)!;
      if (part.count > 0) continue;
      const donor = parts.reduce((best, p) => (p.count > best.count ? p : best));
      if (donor.count <= 1) continue;
      donor.count -= 1;
      part.count += 1;
    }
  }

  const pool: number[] = [];
  for (const part of parts) {
    for (let i = 0; i < part.count; i++) pool.push(part.value);
  }
  return pool;
}

// ============================================================
// FEATURES ALÃ‰ATOIRES
// ============================================================

function rollTileFeatures(rng: SeededRandom, terrain: TerrainType): TileFeature[] {
  const features: TileFeature[] = [];
  const featureChances: Partial<
    Record<TerrainType, Array<{ feature: TileFeature; chance: number }>>
  > = {
    ruins: [
      { feature: 'ancient_ruins', chance: 0.8 },
      { feature: 'ancient_road', chance: 0.3 },
    ],
    mountain: [
      { feature: 'iron_deposit', chance: 0.25 },
      { feature: 'cave_system', chance: 0.2 },
      { feature: 'watchtower_site', chance: 0.15 },
    ],
    hill: [
      { feature: 'iron_deposit', chance: 0.15 },
      { feature: 'watchtower_site', chance: 0.2 },
    ],
    forest: [
      { feature: 'dense_forest', chance: 0.3 },
      { feature: 'ancient_ruins', chance: 0.05 },
    ],
    river: [
      { feature: 'fertile_soil', chance: 0.4 },
      { feature: 'sacred_spring', chance: 0.1 },
    ],
    plains: [
      { feature: 'fertile_soil', chance: 0.3 },
      { feature: 'trade_post', chance: 0.1 },
    ],
    coast: [{ feature: 'natural_harbor', chance: 0.25 }],
    goldmine: [{ feature: 'gold_vein', chance: 0.6 }],
    sacred: [
      { feature: 'sacred_spring', chance: 0.5 },
      { feature: 'ancient_ruins', chance: 0.2 },
    ],
    swamp: [{ feature: 'plague_grounds', chance: 0.15 }],
    jungle: [
      { feature: 'ancient_ruins', chance: 0.15 },
      { feature: 'dragon_lair', chance: 0.05 },
    ],
  };

  const chances = featureChances[terrain] ?? [];
  for (const { feature, chance } of chances) {
    if (rng.next() < chance) features.push(feature);
  }
  return features;
}

// ============================================================
// GÃ‰NÃ‰RATEUR PRINCIPAL
// ============================================================

export class MapGenerator {
  private rng: SeededRandom;
  private config: GameConfig;

  constructor(config: GameConfig) {
    this.config = config;
    this.rng = new SeededRandom(config.mapSeed);
  }

  generate(): Map<string, HexTile> {
    const { radius } = MAP_SIZE_CONFIG[this.config.mapSize];
    const tiles = new Map<string, HexTile>();
    const center: CubeCoord = { q: 0, r: 0, s: 0 };

    // Générer toutes les coordonnées
    const allCoords = hexSpiral(center, radius);
    const coordSet = new Set(allCoords.map((c) => hexToId(c)));

    // Assigner le climat par zone
    const climateMap = this.generateClimateMap(allCoords, radius);

    // Assigner l'élévation par bruit
    const elevationMap = this.generateElevationMap(allCoords);

    // Cartes auxiliaires pour une géographie plus cohérente
    const moistureMap = this.generateMoistureMap(allCoords);
    const temperatureMap = this.generateTemperatureMap(allCoords, elevationMap, radius);

    // 2.2A — Masque de continents (cellular automata)
    const continentMask = this.generateContinentMask(allCoords, coordSet, radius);
    this.applyContinentMask(elevationMap, continentMask, allCoords, radius);

    // 2.2C — Croissance des chaÃ®nes montagneuses
    this.growMountainChains(elevationMap, allCoords, coordSet);

    // Biomes cohérents (moins d'aléatoire local)
    const terrainMap = this.generateTerrainMap(
      allCoords,
      coordSet,
      radius,
      elevationMap,
      climateMap,
      moistureMap,
      temperatureMap,
    );

    // Tuiles sans jetons — assignation après quotas (évite terres productives sans dé).
    for (const coord of allCoords) {
      const id = hexToId(coord);
      const climate = climateMap.get(id) ?? 'temperate';
      const elevation = elevationMap.get(id) ?? 'midland';
      const terrain =
        terrainMap.get(id) ?? this.chooseTerrain(coord, elevation, climate, allCoords, radius);
      const features = rollTileFeatures(this.rng, terrain);

      const tile: HexTile = {
        id,
        coord,
        terrain,
        elevation,
        climate,
        diceValue: null,
        baseProduction: getBaseProduction(terrain),
        modifiers: [],
        features,
        buildings: [],
        units: [],
        owner: null,
        explored: new Set(),
        visible: new Set(),
        river: terrain === 'river',
        road: null,
        port: this.assignPort(terrain, coord, allCoords),
        robber: terrain === 'desert',
        volcano_active: terrain === 'volcano' && this.rng.next() < 0.15,
        fertility: this.calculateFertility(terrain, climate),
        pollution: 0,
      };

      tiles.set(id, tile);
    }

    // 2.2B — Traçage des systèmes de rivières (après création des tuiles)
    this.traceRivers(tiles, coordSet);

    // 2.2D — Quotas minimaux + équilibre biomes classiques
    this.enforceTerrainQuotas(tiles, allCoords, radius);

    // Jetons : pool dimensionné sur les tuiles productives (toutes valeurs du sac)
    this.assignProductionTokens(tiles);

    // Anti-clustering : éviter 6/8 adjacents
    this.antiClusterDice(tiles);

    // Ports or/poisson/épices → 3:1 (ressources jamais produites)
    for (const tile of tiles.values()) {
      tile.port = normalizePortType(tile.port);
    }

    return tiles;
  }

  // ============================================================
  // 2.2A — GÃ‰NÃ‰RATION DE CONTINENTS (cellular automata)
  // ============================================================

  private generateContinentMask(
    coords: CubeCoord[],
    coordSet: Set<string>,
    radius: number,
  ): Map<string, boolean> {
    const mask = new Map<string, boolean>();
    for (const coord of coords) mask.set(hexToId(coord), false);

    // Seeds proportionnels à la taille (2–6) pour un continent comparable.
    const innerRadius = Math.max(1, Math.floor(radius * 0.7));
    const innerCoords = coords.filter(
      (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.s)) <= innerRadius,
    );
    const seedCount = Math.max(2, Math.min(6, Math.round(radius * 0.8)));
    const seeds = this.rng.shuffle(innerCoords).slice(0, seedCount);
    for (const s of seeds) mask.set(hexToId(s), true);

    // 5 itérations de cellular automata
    for (let iter = 0; iter < 5; iter++) {
      const next = new Map(mask);
      for (const coord of coords) {
        const id = hexToId(coord);
        const dist = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s));
        if (dist >= radius) {
          next.set(id, false);
          continue;
        }

        const landNeighbors = hexAllNeighbors(coord).filter(
          (n) => coordSet.has(hexToId(n)) && mask.get(hexToId(n)),
        ).length;

        if (mask.get(id)) {
          next.set(id, landNeighbors >= 1 || this.rng.next() < 0.88);
        } else {
          next.set(
            id,
            landNeighbors >= 4 ||
              (landNeighbors >= 3 && this.rng.next() < 0.58) ||
              (landNeighbors >= 2 && this.rng.next() < 0.22),
          );
        }
      }
      for (const [k, v] of next) mask.set(k, v);
    }

    this.normalizeInteriorLandRatio(mask, coords, coordSet, radius);
    return mask;
  }

  /** Ajuste le masque pour viser ~72 % de terre dans l’intérieur (hors anneau océan). */
  private normalizeInteriorLandRatio(
    mask: Map<string, boolean>,
    coords: CubeCoord[],
    coordSet: Set<string>,
    radius: number,
  ): void {
    const interior = coords.filter(
      (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.s)) < radius,
    );
    if (interior.length === 0) return;

    const landNeighborCount = (coord: CubeCoord) =>
      hexAllNeighbors(coord).filter((n) => coordSet.has(hexToId(n)) && mask.get(hexToId(n)))
        .length;

    const currentLand = () => interior.filter((c) => mask.get(hexToId(c))).length;
    const target = Math.round(interior.length * TARGET_INTERIOR_LAND_RATIO);

    let land = currentLand();
    if (land < target) {
      const candidates = this.rng
        .shuffle(interior.filter((c) => !mask.get(hexToId(c))))
        .sort((a, b) => landNeighborCount(b) - landNeighborCount(a));
      for (const coord of candidates) {
        if (land >= target) break;
        mask.set(hexToId(coord), true);
        land += 1;
      }
    } else if (land > target) {
      const candidates = this.rng
        .shuffle(interior.filter((c) => mask.get(hexToId(c))))
        .sort((a, b) => {
          const distA = Math.max(Math.abs(a.q), Math.abs(a.r), Math.abs(a.s));
          const distB = Math.max(Math.abs(b.q), Math.abs(b.r), Math.abs(b.s));
          // Préférer retirer près du bord, puis cellules peu connectées.
          if (distA !== distB) return distB - distA;
          return landNeighborCount(a) - landNeighborCount(b);
        });
      for (const coord of candidates) {
        if (land <= target) break;
        // Garder le centre et les noyaux bien connectés.
        if (landNeighborCount(coord) >= 5) continue;
        mask.set(hexToId(coord), false);
        land -= 1;
      }
    }
  }

  private applyContinentMask(
    elevationMap: Map<string, ElevationType>,
    continentMask: Map<string, boolean>,
    coords: CubeCoord[],
    radius: number,
  ): void {
    for (const coord of coords) {
      const id = hexToId(coord);
      const isLand = continentMask.get(id) ?? false;
      const curElev = elevationMap.get(id) ?? 'midland';
      const dist = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s));

      if (dist >= radius) {
        // Bords forcés à ocean
        elevationMap.set(id, 'sea');
      } else if (!isLand) {
        // Cellule océan → élévation sea
        elevationMap.set(id, 'sea');
      } else if (curElev === 'sea') {
        // Cellule terre mais bruit dit sea → lowland
        elevationMap.set(id, 'lowland');
      }
    }
  }

  // ============================================================
  // 2.2C — CHAÃŽNES MONTAGNEUSES (cluster growth)
  // ============================================================

  private growMountainChains(
    elevationMap: Map<string, ElevationType>,
    coords: CubeCoord[],
    coordSet: Set<string>,
  ): void {
    for (let pass = 0; pass < 2; pass++) {
      for (const coord of coords) {
        const id = hexToId(coord);
        const elev = elevationMap.get(id);
        if (elev !== 'highland' && elev !== 'peak') continue;

        for (const neighbor of hexAllNeighbors(coord)) {
          if (!coordSet.has(hexToId(neighbor))) continue;
          const nid = hexToId(neighbor);
          const nElev = elevationMap.get(nid);
          if (nElev === 'midland' && this.rng.next() < 0.38) {
            elevationMap.set(nid, 'highland');
          } else if (nElev === 'lowland' && this.rng.next() < 0.1) {
            elevationMap.set(nid, 'midland');
          }
        }
      }
    }
  }

  // ============================================================
  // 2.2B — SYSTÃˆMES DE RIVIÃˆRES (flow from highlands to sea)
  // ============================================================

  private traceRivers(tiles: Map<string, HexTile>, coordSet: Set<string>): void {
    const ELEV_VALUE: Record<ElevationType, number> = {
      sea: 0,
      lowland: 1,
      midland: 2,
      highland: 3,
      peak: 4,
    };

    // Sources : tuiles élévées non-océan
    const sources = [...tiles.values()].filter(
      (t) =>
        (t.elevation === 'peak' || t.elevation === 'highland') &&
        !['ocean', 'coast', 'glacier'].includes(t.terrain),
    );

    // Limiter le nombre de rivières
    const maxRivers = Math.max(2, Math.floor(tiles.size / 18));
    const selected = this.rng.shuffle(sources).slice(0, maxRivers);

    for (const source of selected) {
      let current = source;
      const visited = new Set<string>([current.id]);

      for (let steps = 0; steps < 25; steps++) {
        const neighbors = hexAllNeighbors(current.coord)
          .map((c) => tiles.get(hexToId(c)))
          .filter((t): t is HexTile => t !== undefined && !visited.has(t.id));

        if (neighbors.length === 0) break;

        // Trouver le voisin le plus bas
        const lowest = neighbors.reduce((best, n) =>
          ELEV_VALUE[n.elevation] < ELEV_VALUE[best.elevation] ? n : best,
        );

        // Ne couler que vers le bas ou en palier
        if (ELEV_VALUE[lowest.elevation] > ELEV_VALUE[current.elevation]) break;

        // Arrêter à l'océan / lac / côte
        if (['ocean', 'coast', 'lake'].includes(lowest.terrain) || lowest.elevation === 'sea')
          break;

        // Marquer la tuile comme traversée par une rivière
        if (!['river', 'ocean', 'coast', 'lake'].includes(lowest.terrain)) {
          lowest.river = true;
        }

        visited.add(lowest.id);
        current = lowest;
      }
    }
  }

  // ============================================================
  // 2.2D — QUOTAS MINIMAUX DE TERRAIN
  // ============================================================

  private enforceTerrainQuotas(
    tiles: Map<string, HexTile>,
    _allCoords: CubeCoord[],
    radius: number,
  ): void {
    const total = tiles.size;
    const count = (pred: (t: HexTile) => boolean) => [...tiles.values()].filter(pred).length;

    const landCount = count((t) => !['ocean', 'coast'].includes(t.terrain));
    const coastCount = count((t) => t.terrain === 'coast');
    const strategicCount = count((t) =>
      ['goldmine', 'sacred', 'ruins', 'volcano'].includes(t.terrain),
    );

    // Min terres jouables ≈ 90 % de la cible intérieure (anneau océan exclus)
    const interiorCount = [...tiles.values()].filter((t) => {
      const dist = Math.max(Math.abs(t.coord.q), Math.abs(t.coord.r), Math.abs(t.coord.s));
      return dist < radius;
    }).length;
    const minLand = Math.max(
      Math.ceil(total * 0.38),
      Math.ceil(interiorCount * TARGET_INTERIOR_LAND_RATIO * 0.9),
    );
    if (landCount < minLand) {
      const oceanPool = this.rng.shuffle(
        [...tiles.values()].filter((t) => {
          const dist = Math.max(Math.abs(t.coord.q), Math.abs(t.coord.r), Math.abs(t.coord.s));
          return t.terrain === 'ocean' && dist < radius;
        }),
      );
      const needed = minLand - landCount;
      for (let i = 0; i < Math.min(needed, oceanPool.length); i++) {
        const t = oceanPool[i]!;
        t.terrain = 'plains';
        t.elevation = 'lowland';
        t.baseProduction = getBaseProduction('plains');
        t.diceValue = null;
        t.port = null;
        t.robber = false;
      }
    }

    // Min 8% côtes
    if (coastCount / total < 0.08) {
      const needed = Math.ceil(0.08 * total) - coastCount;
      const candidates = this.rng.shuffle(
        [...tiles.values()].filter(
          (t) =>
            t.terrain === 'ocean' &&
            hexAllNeighbors(t.coord).some((n) => {
              const nt = tiles.get(hexToId(n));
              return nt && !['ocean', 'coast'].includes(nt.terrain);
            }),
        ),
      );
      for (let i = 0; i < Math.min(needed, candidates.length); i++) {
        const t = candidates[i]!;
        t.terrain = 'coast';
        t.elevation = 'lowland';
        t.baseProduction = getBaseProduction('coast');
        t.diceValue = null;
        t.port = this.rng.next() < 0.3 ? 'generic_3:1' : null;
      }
    }

    // Min 2% ressources stratégiques
    if (strategicCount / total < 0.02) {
      const needed = Math.ceil(0.02 * total) - strategicCount;
      const convertable = this.rng.shuffle(
        [...tiles.values()].filter((t) => ['hill', 'mountain', 'plains'].includes(t.terrain)),
      );
      const targets: TerrainType[] = ['goldmine', 'sacred', 'ruins', 'volcano'];
      for (let i = 0; i < Math.min(needed, convertable.length); i++) {
        const t = convertable[i]!;
        const newTerrain = targets[i % targets.length]!;
        t.terrain = newTerrain;
        t.baseProduction = getBaseProduction(newTerrain);
        t.features = rollTileFeatures(this.rng, newTerrain);
      }
    }

    this.balanceClassicResourceTerrains(tiles);
  }

  /**
   * Rééquilibre plains / forest / pasture / hill / mountain aux proportions
   * du sac Catan (4:4:4:3:3), scalées au nombre de tuiles classiques.
   * Ne touche pas aux biomes hors sac (jungle, désert, or, etc.).
   */
  private balanceClassicResourceTerrains(tiles: Map<string, HexTile>): void {
    const classicTiles = [...tiles.values()].filter((t) =>
      CLASSIC_RESOURCE_TERRAINS.includes(t.terrain),
    );
    if (classicTiles.length < CLASSIC_RESOURCE_TERRAINS.length) return;

    const targets = composeScaledClassicTerrainTargets(classicTiles.length);

    const applyTerrain = (t: HexTile, terrain: TerrainType) => {
      t.terrain = terrain;
      t.baseProduction = getBaseProduction(terrain);
      t.features = rollTileFeatures(this.rng, terrain);
      t.robber = false;
    };

    const surplus: HexTile[] = [];
    const deficits: TerrainType[] = [];

    for (const terrain of CLASSIC_RESOURCE_TERRAINS) {
      const target = targets.get(terrain) ?? 0;
      const pool = this.rng.shuffle(classicTiles.filter((t) => t.terrain === terrain));
      if (pool.length > target) {
        surplus.push(...pool.slice(target));
      } else if (pool.length < target) {
        for (let i = 0; i < target - pool.length; i++) deficits.push(terrain);
      }
    }

    const shuffledDeficits = this.rng.shuffle(deficits);
    const shuffledSurplus = this.rng.shuffle(surplus);
    const n = Math.min(shuffledDeficits.length, shuffledSurplus.length);
    for (let i = 0; i < n; i++) {
      applyTerrain(shuffledSurplus[i]!, shuffledDeficits[i]!);
    }
  }

  // ============================================================
  // COHÃ‰RENCE DES BIOMES (moins aléatoire, plus géographique)
  // ============================================================

  private tileRandom(coord: CubeCoord, salt: number): number {
    return coordHash(coord.q, coord.r, this.config.mapSeed + salt);
  }

  private generateMoistureMap(coords: CubeCoord[]): Map<string, number> {
    const map = new Map<string, number>();
    const seed = this.config.mapSeed + 701;

    for (const coord of coords) {
      const coarse = smoothNoise(coord.q, coord.r, 7.2, seed);
      const medium = smoothNoise(coord.q, coord.r, 3.8, seed + 1);
      const detail = smoothNoise(coord.q, coord.r, 1.9, seed + 2);
      const moisture = Math.max(0, Math.min(1, coarse * 0.6 + medium * 0.3 + detail * 0.1));
      map.set(hexToId(coord), moisture);
    }

    return map;
  }

  private generateTemperatureMap(
    coords: CubeCoord[],
    elevationMap: Map<string, ElevationType>,
    radius: number,
  ): Map<string, number> {
    const map = new Map<string, number>();
    const seed = this.config.mapSeed + 1701;

    for (const coord of coords) {
      const latitude = Math.abs(coord.r) / Math.max(1, radius);
      const latHeat = 1 - Math.min(1, latitude * 1.1);
      const noise =
        smoothNoise(coord.q, coord.r, 5.4, seed) * 0.2 +
        smoothNoise(coord.q, coord.r, 2.4, seed + 1) * 0.1;
      const elevation = elevationMap.get(hexToId(coord)) ?? 'midland';

      const elevationPenalty =
        elevation === 'peak'
          ? 0.36
          : elevation === 'highland'
            ? 0.22
            : elevation === 'midland'
              ? 0.1
              : 0;

      const temperature = Math.max(0, Math.min(1, latHeat + noise - elevationPenalty));
      map.set(hexToId(coord), temperature);
    }

    return map;
  }

  private generateTerrainMap(
    coords: CubeCoord[],
    coordSet: Set<string>,
    radius: number,
    elevationMap: Map<string, ElevationType>,
    climateMap: Map<string, ClimateZone>,
    moistureMap: Map<string, number>,
    temperatureMap: Map<string, number>,
  ): Map<string, TerrainType> {
    const terrainMap = new Map<string, TerrainType>();

    for (const coord of coords) {
      const id = hexToId(coord);
      const elevation = elevationMap.get(id) ?? 'midland';
      const climate = climateMap.get(id) ?? 'temperate';
      const moisture = moistureMap.get(id) ?? 0.5;
      const temperature = temperatureMap.get(id) ?? 0.5;
      const terrain = this.chooseCoherentTerrain(
        coord,
        elevation,
        climate,
        moisture,
        temperature,
        coordSet,
        radius,
        elevationMap,
      );
      terrainMap.set(id, terrain);
    }

    this.smoothTerrainMap(terrainMap, elevationMap, coords, coordSet, radius, 3);
    return terrainMap;
  }

  private chooseCoherentTerrain(
    coord: CubeCoord,
    elevation: ElevationType,
    climate: ClimateZone,
    moisture: number,
    temperature: number,
    coordSet: Set<string>,
    radius: number,
    elevationMap: Map<string, ElevationType>,
  ): TerrainType {
    const id = hexToId(coord);
    const dist = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s));
    if (dist >= radius) return 'ocean';

    const neighborElevations = hexAllNeighbors(coord)
      .map((n) => (coordSet.has(hexToId(n)) ? elevationMap.get(hexToId(n)) : undefined))
      .filter((value): value is ElevationType => value !== undefined);
    const nearSea = neighborElevations.some((value) => value === 'sea');
    const nearMountain = neighborElevations.some(
      (value) => value === 'highland' || value === 'peak',
    );

    if (elevation === 'sea') {
      if (nearSea && this.tileRandom(coord, 2501) < 0.52) return 'ocean';
      if (this.tileRandom(coord, 2503) < 0.18 && moisture > 0.6) return 'lake';
      return 'coast';
    }

    if (elevation === 'peak') {
      if (climate === 'arctic' || temperature < 0.22) return 'glacier';
      if (this.tileRandom(coord, 2505) < 0.05) return 'volcano';
      // Mix mountain / hill / highland meadow — avoid clay-quarry walls.
      const peakRoll = this.tileRandom(coord, 2507);
      if (peakRoll < 0.4) return 'mountain';
      if (peakRoll < 0.72) return 'hill';
      return 'pasture';
    }

    if (elevation === 'highland') {
      if ((climate === 'arctic' || temperature < 0.26) && this.tileRandom(coord, 2509) < 0.65)
        return 'glacier';
      if (nearMountain && this.tileRandom(coord, 2511) < 0.08) return 'goldmine';
      if (climate === 'tropical' && moisture > 0.62 && this.tileRandom(coord, 2513) < 0.18)
        return 'jungle';
      const highlandRoll = this.tileRandom(coord, 2515);
      if (highlandRoll < 0.3) return 'mountain';
      if (highlandRoll < 0.58) return 'hill';
      return this.tileRandom(coord, 2516) < 0.55 ? 'forest' : 'pasture';
    }

    if (elevation === 'midland') {
      if (climate === 'arid' && moisture < 0.28)
        return this.tileRandom(coord, 2517) < 0.52 ? 'hill' : 'desert';
      if (climate === 'tropical' && moisture > 0.62)
        return this.tileRandom(coord, 2519) < 0.55 ? 'jungle' : 'forest';
      if (climate === 'arctic' && temperature < 0.34) return 'tundra';
      if (nearSea && moisture > 0.7 && this.tileRandom(coord, 2521) < 0.22) return 'swamp';
      if (nearMountain && this.tileRandom(coord, 2523) < 0.07) return 'goldmine';
      return moisture > 0.52
        ? this.tileRandom(coord, 2525) < 0.56
          ? 'forest'
          : 'pasture'
        : this.tileRandom(coord, 2527) < 0.68
          ? 'plains'
          : 'hill';
    }

    // lowland
    if (nearSea && moisture > 0.6 && this.tileRandom(coord, 2529) < 0.18) return 'lake';
    if (climate === 'arid' && moisture < 0.3)
      return this.tileRandom(coord, 2531) < 0.78 ? 'desert' : 'plains';
    if (climate === 'tropical' && moisture > 0.68)
      return this.tileRandom(coord, 2533) < 0.52 ? 'jungle' : 'swamp';
    if (climate === 'arctic' && temperature < 0.34) return 'tundra';
    if (nearMountain && this.tileRandom(coord, 2535) < 0.06) return 'ruins';
    if (this.tileRandom(coord, 2537) < 0.03) return 'sacred';
    return moisture > 0.58
      ? this.tileRandom(coord, 2539) < 0.54
        ? 'forest'
        : 'pasture'
      : this.tileRandom(coord, 2541) < 0.62
        ? 'plains'
        : 'pasture';
  }

  private smoothTerrainMap(
    terrainMap: Map<string, TerrainType>,
    elevationMap: Map<string, ElevationType>,
    coords: CubeCoord[],
    coordSet: Set<string>,
    radius: number,
    passes: number,
  ): void {
    const waterSet = new Set<TerrainType>(['ocean', 'coast', 'lake']);
    const protectedSet = new Set<TerrainType>(['volcano', 'sacred', 'ruins', 'goldmine']);

    for (let pass = 0; pass < passes; pass++) {
      const next = new Map(terrainMap);

      for (const coord of coords) {
        const id = hexToId(coord);
        const terrain = terrainMap.get(id) ?? 'plains';
        const elevation = elevationMap.get(id) ?? 'midland';
        const dist = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s));
        if (dist >= radius) {
          next.set(id, 'ocean');
          continue;
        }

        const neighbors = hexAllNeighbors(coord)
          .map((n) => (coordSet.has(hexToId(n)) ? terrainMap.get(hexToId(n)) : undefined))
          .filter((value): value is TerrainType => value !== undefined);
        if (neighbors.length === 0) continue;

        const waterNeighbors = neighbors.filter((t) => waterSet.has(t)).length;
        const landNeighbors = neighbors.length - waterNeighbors;

        if (waterSet.has(terrain)) {
          if (terrain === 'ocean' && landNeighbors >= 4) {
            next.set(id, 'coast');
          } else if (terrain === 'coast' && waterNeighbors >= 5) {
            next.set(id, 'ocean');
          }
          continue;
        }

        if (protectedSet.has(terrain) && this.tileRandom(coord, 2551 + pass) < 0.85) {
          continue;
        }

        if (elevation === 'lowland' && waterNeighbors >= 4) {
          next.set(id, 'coast');
          continue;
        }

        const counts = new Map<TerrainType, number>();
        for (const t of neighbors) {
          if (waterSet.has(t)) continue;
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }

        let majorityTerrain: TerrainType | null = null;
        let majorityCount = 0;
        for (const [t, count] of counts) {
          if (count > majorityCount) {
            majorityTerrain = t;
            majorityCount = count;
          }
        }

        if (majorityTerrain && majorityCount >= 4 && majorityTerrain !== terrain) {
          next.set(id, majorityTerrain);
          continue;
        }

        if (majorityTerrain && majorityTerrain !== terrain && majorityCount >= 3) {
          const sameAsCurrent = neighbors.filter((t) => t === terrain).length;
          if (sameAsCurrent <= 1 || majorityCount - sameAsCurrent >= 2) {
            next.set(id, majorityTerrain);
          }
        }
      }

      for (const [id, terrain] of next) terrainMap.set(id, terrain);
    }
  }

  private generateClimateMap(coords: CubeCoord[], radius: number): Map<string, ClimateZone> {
    const map = new Map<string, ClimateZone>();
    const seed = this.config.mapSeed + 901;

    for (const coord of coords) {
      const latitude = Math.abs(coord.r) / Math.max(1, radius);
      const heatBase = 1 - Math.min(1, latitude * 1.15);
      const heatNoise =
        smoothNoise(coord.q, coord.r, 6.4, seed) * 0.2 +
        smoothNoise(coord.q, coord.r, 3.4, seed + 1) * 0.08;
      const dryness =
        smoothNoise(coord.q, coord.r, 5.8, seed + 2) * 0.75 +
        (1 - smoothNoise(coord.q, coord.r, 8.5, seed + 3)) * 0.25;
      const heat = Math.max(0, Math.min(1, heatBase * 0.82 + heatNoise));

      let climate: ClimateZone;
      if (heat < 0.2) {
        climate = 'arctic';
      } else if (heat < 0.45) {
        climate = dryness > 0.66 ? 'mediterranean' : 'temperate';
      } else if (heat < 0.67) {
        climate = dryness > 0.6 ? 'mediterranean' : 'temperate';
      } else {
        climate = dryness > 0.62 ? 'arid' : 'tropical';
      }

      const allowed = this.allowedClimatesByLatitude(latitude);
      if (!allowed.includes(climate)) {
        climate = allowed[0];
      }

      map.set(hexToId(coord), climate);
    }

    this.smoothClimateMap(map, coords, radius, 2);
    return map;
  }

  private allowedClimatesByLatitude(normalizedLatitude: number): ClimateZone[] {
    if (normalizedLatitude > 0.82) return ['arctic', 'temperate'];
    if (normalizedLatitude > 0.62) return ['temperate', 'arctic', 'mediterranean'];
    if (normalizedLatitude > 0.35) return ['temperate', 'mediterranean'];
    if (normalizedLatitude > 0.18) return ['mediterranean', 'temperate', 'tropical', 'arid'];
    return ['tropical', 'arid', 'mediterranean'];
  }

  private smoothClimateMap(
    climateMap: Map<string, ClimateZone>,
    coords: CubeCoord[],
    radius: number,
    passes: number,
  ): void {
    for (let pass = 0; pass < passes; pass++) {
      const next = new Map(climateMap);

      for (const coord of coords) {
        const id = hexToId(coord);
        const current = climateMap.get(id) ?? 'temperate';
        const dist = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s));
        if (dist >= radius) continue;

        const latitude = Math.abs(coord.r) / Math.max(1, radius);
        const allowed = this.allowedClimatesByLatitude(latitude);
        const neighbors = hexAllNeighbors(coord)
          .map((n) => climateMap.get(hexToId(n)))
          .filter((value): value is ClimateZone => value !== undefined);
        if (neighbors.length === 0) continue;

        const counts = new Map<ClimateZone, number>();
        for (const climate of neighbors) {
          counts.set(climate, (counts.get(climate) ?? 0) + 1);
        }

        let majority: ClimateZone = current;
        let majorityCount = 0;
        for (const [climate, count] of counts) {
          if (count > majorityCount) {
            majority = climate;
            majorityCount = count;
          }
        }

        if (majority !== current && majorityCount >= 3 && allowed.includes(majority)) {
          next.set(id, majority);
        }
      }

      for (const [id, climate] of next) climateMap.set(id, climate);
    }
  }

  private generateElevationMap(coords: CubeCoord[]): Map<string, ElevationType> {
    const map = new Map<string, ElevationType>();
    const seed = this.config.mapSeed + 1337;

    for (const coord of coords) {
      // Bruit multi-octaves pour plus de détail géographique
      const noise =
        smoothNoise(coord.q, coord.r, 3, seed) * 0.6 +
        smoothNoise(coord.q, coord.r, 1.5, seed + 1) * 0.3 +
        smoothNoise(coord.q, coord.r, 0.8, seed + 2) * 0.1;
      let elevation: ElevationType;

      if (noise < 0.15) elevation = 'sea';
      else if (noise < 0.35) elevation = 'lowland';
      else if (noise < 0.6) elevation = 'midland';
      else if (noise < 0.82) elevation = 'highland';
      else elevation = 'peak';

      map.set(hexToId(coord), elevation);
    }

    return map;
  }

  /**
   * Place un jeton sur chaque tuile productive.
   * Même règle que Catan variable : aucun 6/8 adjacent à un autre 6/8.
   * On retente des permutations (comme le plateau classique), puis réparation ciblée.
   */
  private assignProductionTokens(tiles: Map<string, HexTile>): void {
    const productive = [...tiles.values()].filter((t) => needsProductionToken(t.terrain));
    for (const tile of tiles.values()) {
      if (!needsProductionToken(tile.terrain)) tile.diceValue = null;
    }
    if (productive.length === 0) return;

    const pool = composeScaledDicePool(productive.length);
    const maxAttempts = Math.max(200, Math.min(800, productive.length * 12));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const order = this.rng.shuffle([...productive]);
      const numbers = this.rng.shuffle([...pool]);
      for (let i = 0; i < order.length; i += 1) {
        order[i]!.diceValue = numbers[i] ?? null;
      }
      if (!mapHasRedNumberConflict(tiles)) return;
    }

    // Dernier recours : réparation par swaps (toujours vers une case sans voisin rouge)
    this.antiClusterDice(tiles);
  }

  /**
   * Répare les conflits 6/8 adjacents en déplaçant un jeton rouge
   * vers une tuile « froide » sans voisin 6/8 (règle Catan variable).
   */
  antiClusterDice(tiles: Map<string, HexTile>): void {
    const productive = [...tiles.values()].filter((t) => t.diceValue !== null);
    if (productive.length === 0) return;

    const isHot = (value: number | null | undefined): boolean => value === 6 || value === 8;
    const hasHotNeighbor = (tile: HexTile): boolean => {
      for (const coord of hexAllNeighbors(tile.coord)) {
        const neighbor = tiles.get(hexToId(coord));
        if (neighbor && isHot(neighbor.diceValue)) return true;
      }
      return false;
    };

    for (let pass = 0; pass < 80; pass += 1) {
      if (!mapHasRedNumberConflict(tiles)) return;

      let moved = false;
      const hotTiles = this.rng.shuffle(productive.filter((t) => isHot(t.diceValue)));

      for (const tile of hotTiles) {
        if (!hasHotNeighbor(tile)) continue;

        // Destinations sûres : jeton froid, aucun voisin rouge (le 6/8 peut y atterrir)
        const safeCool = this.rng.shuffle(
          productive.filter(
            (candidate) =>
              candidate.id !== tile.id &&
              !isHot(candidate.diceValue) &&
              !hasHotNeighbor(candidate),
          ),
        );

        const target = safeCool[0];
        if (!target) continue;

        const tmp = tile.diceValue;
        tile.diceValue = target.diceValue;
        target.diceValue = tmp;
        moved = true;
      }

      if (!moved) break;
    }
  }

  private chooseTerrain(
    coord: CubeCoord,
    elevation: ElevationType,
    climate: ClimateZone,
    allCoords: CubeCoord[],
    radius: number,
  ): TerrainType {
    // Bords de la carte = ocean/coast
    const dist = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.s));
    if (dist >= radius) return 'ocean';
    if (dist === radius - 1 && this.rng.next() < 0.5) return 'coast';

    // Filtrer terrains compatibles
    const compatible = TERRAIN_DISTRIBUTIONS.filter((td) => {
      const elevations: ElevationType[] = ['sea', 'lowland', 'midland', 'highland', 'peak'];
      const minIdx = elevations.indexOf(td.minElevation);
      const maxIdx = elevations.indexOf(td.maxElevation);
      const curIdx = elevations.indexOf(elevation);
      return curIdx >= minIdx && curIdx <= maxIdx && td.climates.includes(climate);
    });

    if (compatible.length === 0) return 'plains';

    // Pondération
    const totalWeight = compatible.reduce((s, t) => s + t.weight, 0);
    let roll = this.rng.next() * totalWeight;

    for (const td of compatible) {
      roll -= td.weight;
      if (roll <= 0) return td.terrain;
    }

    return compatible[compatible.length - 1].terrain;
  }

  private assignPort(
    terrain: TerrainType,
    coord: CubeCoord,
    allCoords: CubeCoord[],
  ): PortType | null {
    if (terrain !== 'coast') return null;
    if (this.rng.next() > 0.35) return null; // 35% des côtes ont un port

    const portTypes: PortType[] = [
      'generic_3:1',
      'generic_3:1',
      'generic_3:1',
      'generic_3:1',
      'wood_2:1',
      'ore_2:1',
      'wheat_2:1',
      'sheep_2:1',
      'clay_2:1',
    ];

    return normalizePortType(portTypes[Math.floor(this.rng.next() * portTypes.length)]);
  }

  private calculateFertility(terrain: TerrainType, climate: ClimateZone): number {
    const baseFertility: Record<TerrainType, number> = {
      plains: 80,
      forest: 60,
      mountain: 10,
      hill: 40,
      pasture: 70,
      desert: 5,
      coast: 30,
      ocean: 0,
      river: 90,
      swamp: 50,
      volcano: 20,
      tundra: 20,
      jungle: 75,
      goldmine: 15,
      sacred: 50,
      ruins: 30,
      glacier: 5,
      lake: 60,
    };

    const climateModifier: Record<ClimateZone, number> = {
      tropical: 1.2,
      temperate: 1.0,
      mediterranean: 1.1,
      arid: 0.4,
      arctic: 0.3,
    };

    const base = baseFertility[terrain] ?? 50;
    return Math.min(100, Math.round(base * climateModifier[climate]));
  }
}

// ============================================================
// PLACEMENT INITIAL DES JOUEURS
// ============================================================

export function findStartingPositions(
  tiles: Map<string, HexTile>,
  playerCount: number,
  mapRadius: number,
  seed: number = 42,
): CubeCoord[] {
  const rng = new SeededRandom(seed + 9999);

  // Distribuer les joueurs en cercle à ~60% du rayon
  const spawnRadius = Math.round(mapRadius * 0.6);
  const candidates = hexRing({ q: 0, r: 0, s: 0 }, spawnRadius);

  const goodTiles = candidates.filter((coord) => {
    const id = hexToId(coord);
    const tile = tiles.get(id);
    if (!tile) return false;
    return !['ocean', 'coast', 'glacier', 'volcano', 'desert'].includes(tile.terrain);
  });

  if (goodTiles.length < playerCount) {
    // Fallback : prendre n'importe quels bons terrains
    const allGood = [...tiles.values()]
      .filter((t) => !['ocean', 'coast', 'glacier', 'volcano', 'desert'].includes(t.terrain))
      .map((t) => t.coord);
    return spreadPositions(allGood, playerCount, rng);
  }

  return spreadPositions(goodTiles, playerCount, rng);
}

// ============================================================
// 1.2C — VÃ‰RIFICATION DE CONNECTIVITÃ‰ (BFS)
// ============================================================

const LAND_PASSABLE: TerrainType[] = [
  'plains',
  'forest',
  'hill',
  'mountain',
  'pasture',
  'desert',
  'river',
  'swamp',
  'volcano',
  'tundra',
  'jungle',
  'goldmine',
  'sacred',
  'ruins',
  'glacier',
  'lake',
  'coast',
];

function arePositionsConnected(tiles: Map<string, HexTile>, positions: CubeCoord[]): boolean {
  if (positions.length <= 1) return true;

  const startId = hexToId(positions[0]);
  const visited = new Set<string>();
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const tile = tiles.get(current);
    if (!tile) continue;

    for (const neighbor of hexAllNeighbors(tile.coord)) {
      const nid = hexToId(neighbor);
      if (!visited.has(nid)) {
        const nt = tiles.get(nid);
        if (nt && (LAND_PASSABLE as string[]).includes(nt.terrain)) {
          queue.push(nid);
        }
      }
    }
  }

  return positions.every((pos) => visited.has(hexToId(pos)));
}

/**
 * Génère la carte et les positions de départ avec retry si la connectivité échoue.
 * Incrémente mapSeed à chaque tentative (jusqu'à maxRetries).
 */
export function generateMapWithConnectivity(
  config: GameConfig,
  playerCount: number,
  maxRetries: number = 6,
): { tiles: Map<string, HexTile>; positions: CubeCoord[] } {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const cfg = attempt === 0 ? config : { ...config, mapSeed: config.mapSeed + attempt };
    const gen = new MapGenerator(cfg);
    const tiles = gen.generate();
    const { radius } = MAP_SIZE_CONFIG[cfg.mapSize];
    const positions = findStartingPositions(tiles, playerCount, radius, cfg.mapSeed);

    if (arePositionsConnected(tiles, positions)) {
      return { tiles, positions };
    }
  }
  // Fallback sans vérification
  const gen = new MapGenerator(config);
  const tiles = gen.generate();
  const { radius } = MAP_SIZE_CONFIG[config.mapSize];
  const positions = findStartingPositions(tiles, playerCount, radius, config.mapSeed);
  return { tiles, positions };
}

function spreadPositions(candidates: CubeCoord[], count: number, rng: SeededRandom): CubeCoord[] {
  if (candidates.length <= count) return candidates.slice(0, count);

  const chosen: CubeCoord[] = [];
  const remaining = [...candidates];

  // BUG FIX: utiliser RNG seedé au lieu de Math.random() pour reproductibilité
  const firstIdx = Math.floor(rng.next() * remaining.length);
  chosen.push(remaining.splice(firstIdx, 1)[0]);

  // Chaque joueur suivant choisit le point le plus éloigné de tous les existants
  while (chosen.length < count && remaining.length > 0) {
    let bestIdx = 0;
    let bestMinDist = -1;

    for (let i = 0; i < remaining.length; i++) {
      const minDist = Math.min(
        ...chosen.map((c) => {
          const dq = c.q - remaining[i].q;
          const dr = c.r - remaining[i].r;
          const ds = c.s - remaining[i].s;
          return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
        }),
      );

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = i;
      }
    }

    chosen.push(remaining.splice(bestIdx, 1)[0]);
  }

  return chosen;
}
