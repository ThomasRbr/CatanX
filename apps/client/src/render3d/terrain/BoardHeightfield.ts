import type { HexTile, TerrainType } from '@catanx/engine';
import * as THREE from 'three';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';
import { sampleTerrainRelief } from './coloredHexSlab';

export interface SurfaceHeightSampler {
  sampleHeight(x: number, z: number): number;
  sampleNormal(x: number, z: number, target?: THREE.Vector3): THREE.Vector3;
  sampleTileHeight(tileId: string, localX?: number, localZ?: number): number;
}

/** Soft dirt-road depression carved into the continuous land surface. */
export interface RoadCarveSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth?: number;
  depth?: number;
}

interface HeightfieldTile {
  id: string;
  terrain: TerrainType;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Base elevation per terrain, in world units, against a hex radius of 1.
 *
 * These were roughly a quarter of what a diorama needs. A mountain rising 0.14
 * over a tile two units across is a 4° slope: the surface stayed flat enough
 * that the alpine albedo read as a grey concrete mesa rather than a mountain,
 * and the eye had no relief to catch. Raising the whole table keeps the
 * relative order intact while giving the island an actual profile.
 */
const TERRAIN_MACRO_ELEVATION: Partial<Record<TerrainType, number>> = {
  mountain: 0.36,
  goldmine: 0.32,
  volcano: 0.46,
  // The ice cap comes from the alpine massif (masked to the hex interior);
  // a high base only lifted the coastal rim into a white plateau.
  glacier: 0.17,
  hill: 0.2,
  ruins: 0.095,
  forest: 0.075,
  jungle: 0.088,
  desert: 0.055,
  plains: 0.034,
  pasture: 0.028,
  tundra: 0.046,
};

const WATER_TERRAINS = new Set<TerrainType>(['ocean', 'coast', 'river', 'lake']);
/**
 * Relative height the land is pulled toward at the waterline. Raised biomes
 * (glacier 0.3, mountain 0.36) otherwise kept full height right up to the hex
 * edge, so the shore skirt dropped from a plateau: a dark vertical wall with a
 * crisp hexagonal rim — the "box" look of edge glaciers and coastal ranges.
 */
const SHORE_ELEVATION = -0.06;
/** Shore samples pull harder than one land tile so edges reach beach height. */
const SHORE_WEIGHT = 1.5;
const WATER_HEIGHT = -0.08;

function inverseYaw(dx: number, dz: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

function distanceToPointyHexEdge(x: number, z: number): number {
  const qx = Math.abs(x);
  const qz = Math.abs(z);
  return Math.max(qx * 0.8660254 + qz * 0.5, qz) / HEX_WORLD_RADIUS;
}

function geologyHash(x: number, z: number, seed: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 0.013) * 43758.5453123;
  return value - Math.floor(value);
}

function geologyNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = geologyHash(x0, z0, seed);
  const b = geologyHash(x0 + 1, z0, seed);
  const c = geologyHash(x0, z0 + 1, seed);
  const d = geologyHash(x0 + 1, z0 + 1, seed);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, sx),
    THREE.MathUtils.lerp(c, d, sx),
    sz,
  );
}

/** Erosion-like ridged multifractal: broad structure first, restrained detail last. */
function ridgedGeology(x: number, z: number, seed: number): number {
  let amplitude = 0.56;
  let frequency = 1;
  let result = 0;
  let normalizer = 0;
  for (let octave = 0; octave < 4; octave++) {
    const noise = geologyNoise(
      x * frequency + octave * 5.31,
      z * frequency - octave * 3.73,
      seed + octave * 47,
    );
    const ridge = 1 - Math.abs(noise * 2 - 1);
    result += ridge * ridge * amplitude;
    normalizer += amplitude;
    amplitude *= 0.48;
    frequency *= 2.08;
  }
  return result / normalizer;
}

function distanceToSegmentSq(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { distanceSq: number; lateral: number; t: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq < 1e-8) {
    const dx = x - ax;
    const dz = z - az;
    return { distanceSq: dx * dx + dz * dz, lateral: 0, t: 0 };
  }
  const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lengthSq, 0, 1);
  const px = ax + abx * t;
  const pz = az + abz * t;
  const dx = x - px;
  const dz = z - pz;
  // Signed lateral distance in the segment's perpendicular frame (for dual ruts).
  const invLen = 1 / Math.sqrt(lengthSq);
  const lateral = dx * (-abz * invLen) + dz * (abx * invLen);
  return { distanceSq: dx * dx + dz * dz, lateral, t };
}

function shoreSamplesFor(landTiles: readonly HeightfieldTile[]): Array<{ x: number; z: number }> {
  const key = (x: number, z: number) => `${Math.round(x * 100)}:${Math.round(z * 100)}`;
  const land = new Set(landTiles.map((tile) => key(tile.x, tile.z)));
  const seen = new Set<string>();
  const out: Array<{ x: number; z: number }> = [];
  const step = Math.sqrt(3) * HEX_WORLD_RADIUS;
  for (const tile of landTiles) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = tile.x + Math.cos(angle) * step;
      const z = tile.z + Math.sin(angle) * step;
      const id = key(x, z);
      if (land.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ x, z });
    }
  }
  return out;
}

/**
 * Deterministic, visual-only heightfield. It samples the exact same relief
 * function and per-tile rotation as the rendered slabs; rules and hitboxes are
 * deliberately unaffected.
 */
export class BoardHeightfield implements SurfaceHeightSampler {
  private readonly tiles: HeightfieldTile[];
  private readonly landTiles: HeightfieldTile[];
  private readonly alpineTiles: HeightfieldTile[];
  /** Centres of water / off-map cells that touch land. */
  private readonly shoreSamples: Array<{ x: number; z: number }>;
  private readonly byId: Map<string, HeightfieldTile>;
  private readonly phase: number;
  private roadCarves: readonly RoadCarveSegment[] = [];

  constructor(tiles: readonly HexTile[], roadCarves: readonly RoadCarveSegment[] = []) {
    this.tiles = tiles.map((tile) => {
      const world = cubeToWorld(tile.coord);
      return {
        id: tile.id,
        terrain: tile.terrain,
        x: world.x,
        z: world.z,
        yaw: ((hashString(tile.id) % 6) * Math.PI) / 3,
      };
    });
    this.byId = new Map(this.tiles.map((tile) => [tile.id, tile]));
    this.landTiles = this.tiles.filter((tile) => !WATER_TERRAINS.has(tile.terrain));
    this.alpineTiles = this.tiles.filter(
      (tile) => tile.terrain === 'mountain' || tile.terrain === 'goldmine' || tile.terrain === 'glacier',
    );
    this.shoreSamples = shoreSamplesFor(this.landTiles);
    this.phase = (hashString(this.tiles.map((tile) => tile.id).sort().join('|')) % 8192) / 8192 * Math.PI * 2;
    this.roadCarves = roadCarves;
  }

  setRoadCarves(roadCarves: readonly RoadCarveSegment[]): void {
    this.roadCarves = roadCarves;
  }

  private roadCarveAmount(x: number, z: number): number {
    if (this.roadCarves.length === 0) return 0;
    let deepest = 0;
    for (const segment of this.roadCarves) {
      const halfWidth = segment.halfWidth ?? 0.11;
      const depth = segment.depth ?? 0.03;
      const { distanceSq, lateral, t } = distanceToSegmentSq(
        x, z, segment.ax, segment.az, segment.bx, segment.bz,
      );
      const distance = Math.sqrt(distanceSq);
      if (distance >= halfWidth) continue;
      const edge = 1 - distance / halfWidth;
      const falloff = edge * edge * (3 - 2 * edge);
      // Dual wheel ruts — deeper near ±0.35 of the bed, softer on the crown.
      const rutNorm = Math.abs(lateral) / Math.max(0.001, halfWidth);
      const rut = Math.exp(-((rutNorm - 0.34) ** 2) / 0.045) * 0.45
        + Math.exp(-((rutNorm - 0.0) ** 2) / 0.12) * 0.22;
      const pulse = 0.92 + 0.08 * Math.sin(t * Math.PI * 5 + segment.ax * 3.1);
      deepest = Math.max(deepest, depth * falloff * (0.62 + rut) * pulse);
    }
    return deepest;
  }

  private nearest(x: number, z: number): HeightfieldTile | null {
    let best: HeightfieldTile | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of this.tiles) {
      const dx = x - tile.x;
      const dz = z - tile.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
    return best;
  }

  private sample(tile: HeightfieldTile, worldX: number, worldZ: number): number {
    if (WATER_TERRAINS.has(tile.terrain)) return WATER_HEIGHT;
    const local = inverseYaw(worldX - tile.x, worldZ - tile.z, tile.yaw);
    // Outside the visual tile we return the shared seam height. This keeps
    // roads and intersections stable between adjacent biomes.
    if (distanceToPointyHexEdge(local.x, local.z) > 1.035) return HEX_SLAB_THICKNESS;
    return HEX_SLAB_THICKNESS + sampleTerrainRelief(
      tile.terrain,
      local.x,
      local.z,
      HEX_WORLD_RADIUS * 1.015,
    );
  }

  private macroRelief(x: number, z: number): number {
    const broad = Math.sin(x * 0.52 + z * 0.31 + this.phase) * 0.032;
    const cross = Math.sin(x * -0.27 + z * 0.67 - this.phase * 0.73) * 0.022;
    const islandFold = Math.sin((x + z) * 0.19 + this.phase * 1.37) * 0.024;
    return broad + cross + islandFold;
  }

  /**
   * Alpine massif for one tile: summits, connecting arêtes and a central col.
   *
   * This is added *after* the neighbour blend instead of inside it. Averaging
   * a mountain with six lowland neighbours is what flattened every range into
   * a grey dome: the summit lost two thirds of its height to the weights.
   * The massif is masked to the hex interior, so intersections and edges —
   * where settlements and roads sit — keep the blended foothill height.
   */
  private alpineMassif(tile: HeightfieldTile, x: number, z: number): number {
    const dx = x - tile.x;
    const dz = z - tile.z;
    // Pointy-top hex metric, 1 on the boundary.
    const ax = Math.abs(dx);
    const az = Math.abs(dz);
    const hexDistance = Math.max(ax, ax * 0.5 + az * 0.8660254) / (0.8660254 * HEX_WORLD_RADIUS);
    if (hexDistance >= 1) return 0;
    const mask = 1 - THREE.MathUtils.smoothstep(hexDistance, 0.46, 0.97);
    if (mask <= 0) return 0;

    const local = inverseYaw(dx, dz, tile.yaw);
    const seed = hashString(`massif:${tile.id}`);
    const rand = (k: number) => ((Math.imul(seed ^ (k * 2654435761), 1597334677) >>> 0) % 10007) / 10007;
    const base = rand(1) * Math.PI * 2;
    const summits: Array<{ x: number; z: number; h: number }> = [];
    for (let i = 0; i < 3; i++) {
      const angle = base + i * 2.09 + (rand(10 + i) - 0.5) * 0.7;
      const radius = 0.34 + rand(20 + i) * 0.18;
      summits.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        h: [1, 0.78, 0.62][i]! * (0.9 + rand(30 + i) * 0.2),
      });
    }

    // Peaks are cones with an exponential flank: sharp crests, concave slopes.
    let field = 0;
    for (const summit of summits) {
      // Softened apex (the 0.05 term) so the crest is not a single spike vertex.
      const d = Math.sqrt((local.x - summit.x) ** 2 + (local.z - summit.z) ** 2 + 0.0025) - 0.05;
      field = Math.max(field, summit.h * Math.exp(-d / 0.26));
    }
    // Arêtes linking the summits, sagging between them.
    for (let i = 0; i < summits.length; i++) {
      const a = summits[i]!;
      const b = summits[(i + 1) % summits.length]!;
      const { distanceSq, t } = distanceToSegmentSq(local.x, local.z, a.x, a.z, b.x, b.z);
      const crest = THREE.MathUtils.lerp(a.h, b.h, t) * (0.62 + 0.14 * Math.abs(t - 0.5) * 2);
      field = Math.max(field, crest * Math.exp(-Math.sqrt(distanceSq) / 0.11));
    }

    // Crags and gullies: ridged noise carves the flanks, strongest mid-slope.
    const crag = ridgedGeology(local.x * 3.1 + rand(40) * 10, local.z * 3.1 - rand(41) * 10, seed);
    const gully = ridgedGeology(local.x * 6.3 - rand(42) * 7, local.z * 6.3 + rand(43) * 7, seed + 911);
    const midSlope = field * (1 - field);
    field += (crag - 0.45) * 0.16 * field + (gully - 0.5) * 0.22 * midSlope;

    // A col at the centre gives the production chit somewhere to rest.
    const centre = Math.hypot(local.x, local.z);
    field *= THREE.MathUtils.lerp(0.42, 1, THREE.MathUtils.smoothstep(centre, 0.1, 0.3));

    // Glaciers are rounded ice caps, not jagged ranges.
    const amplitude = tile.terrain === 'goldmine' ? 0.62 : tile.terrain === 'glacier' ? 0.5 : 0.84;
    return Math.max(0, field) * mask * amplitude;
  }

  private geologicalRelief(tile: HeightfieldTile, localX: number, localZ: number): number {
    // Mountains are carved by alpineMassif after the blend.
    if (tile.terrain === 'mountain' || tile.terrain === 'goldmine') return 0;
    if (tile.terrain !== 'desert') return 0;
    const x = localX / HEX_WORLD_RADIUS;
    const z = localZ / HEX_WORLD_RADIUS;
    const radial = Math.sqrt(x * x + z * z);
    const envelope = THREE.MathUtils.smoothstep(1 - radial, 0.02, 0.48);
    const phase = (hashString(`geology:${tile.id}`) % 4096) / 4096 * Math.PI * 2;
    if (tile.terrain === 'desert') {
      const warpedAxis = x * 0.76 + z * 0.43 + Math.sin(z * 3.7 + phase) * 0.065;
      const primary = Math.pow(Math.max(0, Math.sin(warpedAxis * 9.2 + phase)), 2.2) * 0.046;
      const secondaryAxis = x * -0.31 + z * 0.88;
      const secondary = Math.pow(Math.max(0, Math.sin(secondaryAxis * 13.5 - phase * 0.6)), 3) * 0.014;
      return (primary + secondary) * envelope;
    }
    // Alpine relief is built as a broad folded mass, not a narrow Gaussian
    // spike.  Rotating the geological axes per tile keeps ranges varied while
    // the wide envelope lets neighbouring samples blend into true foothills.
    const orientation = phase * 0.37;
    const cos = Math.cos(orientation);
    const sin = Math.sin(orientation);
    const along = x * cos + z * sin;
    const across = -x * sin + z * cos;
    const warpedAcross = across
      + Math.sin(along * 3.1 + phase) * 0.085
      + Math.sin(along * 6.3 - phase * 0.42) * 0.028;
    const primaryFold = Math.exp(-warpedAcross * warpedAcross * 5.2);
    const broadShoulder = Math.exp(-warpedAcross * warpedAcross * 0.88) * 0.28;
    const spurAxis = across * 0.62 + along * 0.48 + Math.cos(across * 3.7 - phase) * 0.08;
    const secondaryFold = Math.exp(-spurAxis * spurAxis * 6.8) * 0.2;
    const seed = hashString(`alpine:${tile.id}`);
    const cragField = ridgedGeology(along * 1.9 + phase, across * 2.4 - phase, seed);
    const erosionField = ridgedGeology(along * 3.2 - phase, across * 4.8 + phase, seed + 941);
    const summitRhythm = 0.73
      + cragField * 0.2
      + Math.sin(along * 4.1 + phase * 0.8) * 0.055;
    // Drainage cuts are strongest on the flanks. Keeping their scale below
    // the main fold prevents the surface from turning into noisy spikes.
    const flank = THREE.MathUtils.smoothstep(Math.abs(warpedAcross), 0.08, 0.72);
    const erosionGully = Math.pow(Math.max(0, erosionField - 0.56) / 0.44, 2)
      * 0.075
      * flank;
    const broadEnvelope = 1 - THREE.MathUtils.smoothstep(radial, 0.12, 1.08);
    // Fold amplitude on top of the base elevation. Together they put a summit
    // roughly one hex radius above its foothills, which is what makes a ridge
    // catch the key light and cast a shadow across its neighbours.
    const amplitude = tile.terrain === 'goldmine' ? 0.38 : 0.48;
    return Math.max(
      0,
      (primaryFold * 0.76 + broadShoulder + secondaryFold) * summitRhythm - erosionGully,
    ) * broadEnvelope * amplitude;
  }

  private sampleContinuousLand(x: number, z: number): number {
    let totalWeight = 0;
    let totalHeight = 0;
    for (const tile of this.landTiles) {
      const dx = x - tile.x;
      const dz = z - tile.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > 4.8) continue;
      const local = inverseYaw(dx, dz, tile.yaw);
      if (distanceToPointyHexEdge(local.x, local.z) > 1.13) continue;
      const weight = Math.exp(-distanceSq / 0.62);
      const localRelief = sampleTerrainRelief(
        tile.terrain,
        local.x,
        local.z,
        HEX_WORLD_RADIUS * 1.015,
      );
      const geologicalRelief = this.geologicalRelief(tile, local.x, local.z);
      const elevation = TERRAIN_MACRO_ELEVATION[tile.terrain] ?? 0.016;
      // Fine hex-surface noise is useful on soil, but multiplying it on alpine
      // terrain produced a row of inflated pillows. Mountains get their form
      // from the geological folds above and retain only restrained micro relief.
      const localDetailScale = tile.terrain === 'mountain' || tile.terrain === 'goldmine'
        ? 0.56
        : 1.48;
      totalHeight += (elevation + localRelief * localDetailScale + geologicalRelief) * weight;
      totalWeight += weight;
    }
    if (totalWeight <= 0.0001) return HEX_SLAB_THICKNESS - this.roadCarveAmount(x, z);
    for (const shore of this.shoreSamples) {
      const dx = x - shore.x;
      const dz = z - shore.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > 4.8) continue;
      const weight = Math.exp(-distanceSq / 0.62) * SHORE_WEIGHT;
      totalHeight += SHORE_ELEVATION * weight;
      totalWeight += weight;
    }
    let massif = 0;
    for (const tile of this.alpineTiles) {
      const ddx = x - tile.x;
      const ddz = z - tile.z;
      if (ddx * ddx + ddz * ddz > 1.1) continue;
      massif = Math.max(massif, this.alpineMassif(tile, x, z));
    }
    return HEX_SLAB_THICKNESS + totalHeight / totalWeight + massif + this.macroRelief(x, z) - this.roadCarveAmount(x, z);
  }

  sampleHeight(x: number, z: number): number {
    const tile = this.nearest(x, z);
    if (!tile) return 0;
    if (WATER_TERRAINS.has(tile.terrain) && this.landTiles.length === 0) return WATER_HEIGHT;
    return this.sampleContinuousLand(x, z);
  }

  sampleTileHeight(tileId: string, localX = 0, localZ = 0): number {
    const tile = this.byId.get(tileId);
    if (!tile) return HEX_SLAB_THICKNESS;
    const c = Math.cos(tile.yaw);
    const s = Math.sin(tile.yaw);
    const worldX = tile.x + c * localX + s * localZ;
    const worldZ = tile.z - s * localX + c * localZ;
    return this.sampleContinuousLand(worldX, worldZ);
  }

  sampleNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
    const epsilon = 0.015;
    const left = this.sampleHeight(x - epsilon, z);
    const right = this.sampleHeight(x + epsilon, z);
    const down = this.sampleHeight(x, z - epsilon);
    const up = this.sampleHeight(x, z + epsilon);
    return target.set(left - right, epsilon * 2, down - up).normalize();
  }
}
