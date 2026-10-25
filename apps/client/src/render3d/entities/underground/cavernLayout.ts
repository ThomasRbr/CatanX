/**
 * Pure layout of the underground cave: where the rock is, where the chambers
 * and passages are carved, and how high every point of the cavern floor sits.
 *
 * Everything here is derived from the static map + underground graph (which
 * never change during a game), so it is computed once per board and shared by
 * the terrain mesh and every prop that has to sit on it.
 */
import type { HexTile, UndergroundGraph } from '@catanx/engine';
import { isClassicLandTerrain } from '@catanx/engine';
import { cubeToWorld } from '../../utils/hexToWorld';
import { mixSeeds } from '../../utils/seededVisualRandom';
import { createCavernNoise, smin, smoothstep, type CavernNoise } from './cavernNoise';

/** Radius of the open floor of a chamber (hex circumradius is 1). */
export const CHAMBER_RADIUS = 0.54;
/** Half width of a natural passage between two chambers. */
export const PASSAGE_HALF_WIDTH = 0.15;
/** Mean height of the rock mass between chambers. */
export const WALL_HEIGHT = 0.44;
/** Extra height of the cut-away cliffs along the far rim of the cave. */
export const BACK_RIM_BOOST = 0.62;
/** How far the rock block extends past the outermost land hex edges. */
export const FOOTPRINT_EXPAND = 0.1;
/** Bottom of the cut-away rock block. */
export const BLOCK_BOTTOM = -1.75;

const SQRT3 = Math.sqrt(3);
const HEX_INRADIUS = SQRT3 / 2;
/** Unit vector pointing away from the camera on the board plane. */
export const BACK_DIR = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };

export interface CavernNodeInfo {
  id: string;
  tileId: string;
  x: number;
  z: number;
  q: number;
  r: number;
}

export interface CavernEdgeInfo {
  id: string;
  a: string;
  b: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
}

export interface CavernCorner {
  x: number;
  z: number;
  /** Number of land hexes sharing this corner (1–3). */
  landCount: number;
  key: string;
}

export interface CavernBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CavernLayout {
  seed: number;
  noise: CavernNoise;
  nodes: CavernNodeInfo[];
  nodeById: Map<string, CavernNodeInfo>;
  edges: CavernEdgeInfo[];
  edgeById: Map<string, CavernEdgeInfo>;
  corners: CavernCorner[];
  bounds: CavernBounds;
  centre: { x: number; z: number };
  /** Signed distance to the rock block outline (negative inside). */
  footprint(x: number, z: number): number;
  /** Signed distance to carved open space (negative inside chambers/passages). */
  openDistance(x: number, z: number): number;
  /** Height of the cave surface (floor or rock top). */
  heightAt(x: number, z: number): number;
  /** Footprint gradient (unit, points outward). */
  footprintNormal(x: number, z: number): { x: number; z: number };
}

function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Pointy-top world XZ → rounded axial coordinate. */
export function worldToAxial(x: number, z: number): { q: number; r: number } {
  const qf = (SQRT3 / 3) * x - z / 3;
  const rf = (2 / 3) * z;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

/** Exact SDF of a pointy-top hexagon of circumradius 1 (flat sides on ±X). */
function hexSdf(px: number, pz: number): number {
  const ax = Math.abs(px);
  const az = Math.abs(pz);
  return Math.max(ax, ax * 0.5 + az * HEX_INRADIUS) - HEX_INRADIUS;
}

function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  const cx = ax + dx * t - px;
  const cz = az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

export function buildCavernLayout(
  map: Map<string, HexTile>,
  graph: UndergroundGraph,
  mapSeed: number,
): CavernLayout {
  const seed = mixSeeds(mapSeed, 'catanx-underground-cavern-v1');
  const noise = createCavernNoise(seed);

  const land = new Map<string, { x: number; z: number }>();
  for (const tile of map.values()) {
    if (!isClassicLandTerrain(tile.terrain)) continue;
    const w = cubeToWorld(tile.coord);
    land.set(axialKey(tile.coord.q, tile.coord.r), { x: w.x, z: w.z });
  }

  const nodes: CavernNodeInfo[] = [];
  const nodeById = new Map<string, CavernNodeInfo>();
  const nodeByAxial = new Map<string, CavernNodeInfo>();
  for (const node of Object.values(graph.nodes).sort((a, b) => a.id.localeCompare(b.id))) {
    const tile = map.get(node.surfaceTileId);
    if (!tile) continue;
    const w = cubeToWorld(tile.coord);
    const info: CavernNodeInfo = {
      id: node.id,
      tileId: tile.id,
      x: w.x,
      z: w.z,
      q: tile.coord.q,
      r: tile.coord.r,
    };
    nodes.push(info);
    nodeById.set(node.id, info);
    nodeByAxial.set(axialKey(tile.coord.q, tile.coord.r), info);
    // A node always sits under land, but be tolerant of odd maps.
    if (!land.has(axialKey(tile.coord.q, tile.coord.r))) {
      land.set(axialKey(tile.coord.q, tile.coord.r), { x: w.x, z: w.z });
    }
  }

  const edges: CavernEdgeInfo[] = [];
  const edgeById = new Map<string, CavernEdgeInfo>();
  const edgesByNode = new Map<string, CavernEdgeInfo[]>();
  for (const edge of Object.values(graph.edges).sort((a, b) => a.id.localeCompare(b.id))) {
    const a = nodeById.get(edge.a);
    const b = nodeById.get(edge.b);
    if (!a || !b) continue;
    const info: CavernEdgeInfo = {
      id: edge.id,
      a: a.id,
      b: b.id,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      length: Math.hypot(b.x - a.x, b.z - a.z),
    };
    edges.push(info);
    edgeById.set(edge.id, info);
    for (const id of [a.id, b.id]) {
      const list = edgesByNode.get(id) ?? [];
      list.push(info);
      edgesByNode.set(id, list);
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of land.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minZ = maxZ = 0;
  }
  const bounds: CavernBounds = { minX: minX - 1.3, maxX: maxX + 1.3, minZ: minZ - 1.3, maxZ: maxZ + 1.3 };
  const centre = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };

  const footprint = (x: number, z: number): number => {
    const { q, r } = worldToAxial(x, z);
    let d = 3;
    for (const [dq, dr] of NEIGHBOURS) {
      const p = land.get(axialKey(q + dq, r + dr));
      if (!p) continue;
      d = smin(d, hexSdf(x - p.x, z - p.z), 0.32);
    }
    const wobble = 0.09 * noise.fbm(x * 1.45 + 40, z * 1.45 - 12, 3) + 0.035 * noise.n2(x * 5.2, z * 5.2);
    return d - FOOTPRINT_EXPAND + wobble;
  };

  const footprintNormal = (x: number, z: number) => {
    const e = 0.03;
    const gx = footprint(x + e, z) - footprint(x - e, z);
    const gz = footprint(x, z + e) - footprint(x, z - e);
    const len = Math.hypot(gx, gz) || 1;
    return { x: gx / len, z: gz / len };
  };

  const openDistance = (x: number, z: number): number => {
    const { q, r } = worldToAxial(x, z);
    let chamber = 5;
    let passage = 5;
    for (const [dq, dr] of NEIGHBOURS) {
      const node = nodeByAxial.get(axialKey(q + dq, r + dr));
      if (!node) continue;
      const radius = CHAMBER_RADIUS * (1 + 0.1 * noise.n2(x * 2.4 + 7, z * 2.4 - 3));
      chamber = Math.min(chamber, Math.hypot(x - node.x, z - node.z) - radius);
      const incident = edgesByNode.get(node.id);
      if (!incident) continue;
      for (const edge of incident) {
        const width = PASSAGE_HALF_WIDTH * (1 + 0.22 * noise.n2(x * 3.3 - 5, z * 3.3 + 11));
        passage = Math.min(
          passage,
          segmentDistance(x, z, edge.ax, edge.az, edge.bx, edge.bz) - width,
        );
      }
    }
    return smin(chamber, passage, 0.2);
  };

  const heightAt = (x: number, z: number): number => {
    const open = openDistance(x, z);
    const floor = 0.024 * noise.fbm(x * 3.1, z * 3.1, 3) + 0.009 * noise.n2(x * 11, z * 11);
    const o = open + 0.04 * noise.n2(x * 6.5 + 3, z * 6.5);
    // Two tiers: a steep lower cliff, then a ledge rising to the crest.
    const t = smoothstep(-0.02, 0.15, o);
    if (t <= 0) return floor;
    const t2 = smoothstep(0.18, 0.42, o);
    let wall =
      WALL_HEIGHT * (0.8 + 0.4 * (0.5 + 0.5 * noise.fbm(x * 0.75, z * 0.75, 3)))
      + 0.15 * noise.ridged(x * 3.1, z * 3.1, 3) * (0.4 + 0.6 * t2)
      - 0.06;
    wall *= 0.74 + 0.26 * t2;
    const foot = footprint(x, z);
    const nearEdge = smoothstep(-1.05, -0.05, foot);
    if (nearEdge > 0) {
      const back = smoothstep(-0.45, 0.35, footprint(x + BACK_DIR.x * 0.95, z + BACK_DIR.z * 0.95));
      const front = smoothstep(-0.45, 0.35, footprint(x - BACK_DIR.x * 0.95, z - BACK_DIR.z * 0.95));
      wall += nearEdge * back * BACK_RIM_BOOST * (0.6 + 0.55 * (0.5 + 0.5 * noise.n2(x * 1.7, z * 1.7)));
      wall *= 1 - 0.38 * nearEdge * front;
    }
    return floor + (wall - floor) * t;
  };

  // Hex corners: wall junctions between chambers, and rim points.
  const cornerMap = new Map<string, CavernCorner>();
  for (const p of land.values()) {
    for (let k = 0; k < 6; k++) {
      const angle = (Math.PI / 3) * k + Math.PI / 6;
      const x = p.x + Math.cos(angle);
      const z = p.z + Math.sin(angle);
      const key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
      const existing = cornerMap.get(key);
      if (existing) existing.landCount += 1;
      else cornerMap.set(key, { x, z, landCount: 1, key });
    }
  }
  const corners = [...cornerMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  return {
    seed,
    noise,
    nodes,
    nodeById,
    edges,
    edgeById,
    corners,
    bounds,
    centre,
    footprint,
    openDistance,
    heightAt,
    footprintNormal,
  };
}

/** Screen-space axes of the diorama camera on the board plane. */
export const SCREEN_RIGHT = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
export const SCREEN_DOWN = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

export interface ChamberAnchors {
  centrepiece: { x: number; z: number; scale: number };
  outpost: { x: number; z: number };
  extractor: { x: number; z: number };
}

/**
 * Where things stand inside a chamber. An occupied chamber pushes its
 * centrepiece back so the outpost (front left) and extractor (front right)
 * never hide it from the camera.
 */
export function chamberAnchors(node: { x: number; z: number }, occupied: boolean): ChamberAnchors {
  const at = (down: number, right: number) => ({
    x: node.x + SCREEN_DOWN.x * down + SCREEN_RIGHT.x * right,
    z: node.z + SCREEN_DOWN.z * down + SCREEN_RIGHT.z * right,
  });
  const centre = occupied ? at(-0.15, 0.04) : at(0, 0);
  return {
    centrepiece: { ...centre, scale: occupied ? 0.8 : 1 },
    outpost: at(0.2, -0.13),
    extractor: at(0.1, 0.25),
  };
}
