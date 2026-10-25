/**
 * Procedural geometry for the underground: the carved cave terrain (floor,
 * rock mass and cut-away strata cliffs) and the shared rock prop meshes.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCavernNoise, smoothstep } from './cavernNoise';
import { BACK_DIR, BLOCK_BOTTOM, WALL_HEIGHT, type CavernLayout } from './cavernLayout';

// ---------------------------------------------------------------------------
// Kit builder: merges coloured primitives into one non-indexed geometry.
// ---------------------------------------------------------------------------

export interface PartTransform {
  p?: readonly [number, number, number];
  r?: readonly [number, number, number];
  s?: number | readonly [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sv = new THREE.Vector3();

export function transformMatrix(t: PartTransform, out = new THREE.Matrix4()): THREE.Matrix4 {
  const p = t.p ?? [0, 0, 0];
  const r = t.r ?? [0, 0, 0];
  const s = t.s ?? 1;
  _e.set(r[0], r[1], r[2], 'YXZ');
  _q.setFromEuler(_e);
  _v.set(p[0], p[1], p[2]);
  if (typeof s === 'number') _sv.set(s, s, s);
  else _sv.set(s[0], s[1], s[2]);
  return out.compose(_v, _q, _sv);
}

/** Normalise a primitive: non-indexed, position + normal + color only. */
export function colouredPart(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  transform: PartTransform = {},
  intensity = 1,
): THREE.BufferGeometry {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const existing = geo.attributes.color;
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.applyMatrix4(transformMatrix(transform, _m));
  const c = new THREE.Color(color);
  const count = geo.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Shared prop meshes carry their own shading ramp: keep it as a multiplier.
    const kr = existing ? existing.getX(i) : 1;
    const kg = existing ? existing.getY(i) : 1;
    const kb = existing ? existing.getZ(i) : 1;
    colors[i * 3] = c.r * intensity * kr;
    colors[i * 3 + 1] = c.g * intensity * kg;
    colors[i * 3 + 2] = c.b * intensity * kb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export class KitBuilder {
  private parts: Record<string, THREE.BufferGeometry[]> = {};

  add(
    target: string,
    geometry: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    transform: PartTransform = {},
    intensity = 1,
  ): this {
    (this.parts[target] ??= []).push(colouredPart(geometry, color, transform, intensity));
    return this;
  }

  build(target: string): THREE.BufferGeometry | null {
    const list = this.parts[target];
    if (!list || list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) return null;
    merged.computeBoundingSphere();
    return merged;
  }
}

// ---------------------------------------------------------------------------
// Shared rock props.
// ---------------------------------------------------------------------------

const propNoise = createCavernNoise(0x5eed_cafe);

function displace(geo: THREE.BufferGeometry, amount: number, freq: number, seed = 0): THREE.BufferGeometry {
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = propNoise.n3(x * freq + seed, y * freq - seed * 0.7, z * freq + seed * 1.3);
    const len = Math.hypot(x, y, z) || 1;
    const k = 1 + n * amount;
    pos.setXYZ(i, (x / len) * len * k, (y / len) * len * k, (z / len) * len * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Vertical colour ramp written into a `color` attribute. */
function rampColours(
  geo: THREE.BufferGeometry,
  stops: ReadonlyArray<readonly [number, THREE.ColorRepresentation]>,
  axisMin: number,
  axisMax: number,
): void {
  const pos = geo.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const cols = stops.map(([t, c]) => [t, new THREE.Color(c)] as const);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - axisMin) / (axisMax - axisMin);
    let k = 0;
    while (k < cols.length - 2 && t > cols[k + 1]![0]) k++;
    const [t0, c0] = cols[k]!;
    const [t1, c1] = cols[Math.min(k + 1, cols.length - 1)]!;
    const f = THREE.MathUtils.clamp((t - t0) / Math.max(1e-5, t1 - t0), 0, 1);
    tmp.copy(c0).lerp(c1, f);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

let stalagmiteGeo: THREE.BufferGeometry | null = null;
/** Unit-height stalagmite (base radius ~0.5), calcite tip. */
export function getStalagmiteGeometry(): THREE.BufferGeometry {
  if (stalagmiteGeo) return stalagmiteGeo;
  const profile: THREE.Vector2[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = 0.5 * Math.pow(1 - t, 1.35) * (1 + 0.12 * Math.sin(t * 13)) + 0.012;
    profile.push(new THREE.Vector2(Math.max(0.0, i === steps ? 0 : r), t - 0.08));
  }
  const geo = new THREE.LatheGeometry(profile, 8);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = propNoise.n3(x * 6, y * 5, z * 6);
    pos.setXYZ(i, x * (1 + 0.28 * n), y, z * (1 + 0.28 * n));
  }
  geo.computeVertexNormals();
  rampColours(geo, [[0, '#4a3f3b'], [0.45, '#6e5f55'], [0.85, '#b3a493'], [1, '#d8cdbd']], -0.08, 0.92);
  stalagmiteGeo = geo;
  return geo;
}

let columnGeo: THREE.BufferGeometry | null = null;
/** Unit-height cave column: a stalagmite fused with a stalactite. */
export function getColumnGeometry(): THREE.BufferGeometry {
  if (columnGeo) return columnGeo;
  const profile: THREE.Vector2[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const waist = 0.16 + 0.34 * Math.pow(Math.abs(t - 0.58) / 0.58, 1.6);
    const r = waist * (1 + 0.1 * Math.sin(t * 21)) * (t > 0.96 ? 1.15 : 1);
    profile.push(new THREE.Vector2(r, t - 0.04));
  }
  const geo = new THREE.LatheGeometry(profile, 9);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = propNoise.n3(x * 5 + 3, y * 7, z * 5);
    pos.setXYZ(i, x * (1 + 0.3 * n), y, z * (1 + 0.3 * n));
  }
  geo.computeVertexNormals();
  rampColours(geo, [[0, '#3c3330'], [0.3, '#5c4f46'], [0.58, '#7a6b5e'], [0.8, '#54483f'], [1, '#2f2826']], -0.04, 0.96);
  columnGeo = geo;
  return geo;
}

let boulderGeo: THREE.BufferGeometry | null = null;
/** Unit-radius smooth boulder. */
export function getBoulderGeometry(): THREE.BufferGeometry {
  if (boulderGeo) return boulderGeo;
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  displace(geo, 0.32, 1.6, 2);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    // Flatten the underside so boulders sit on the floor.
    const y = pos.getY(i);
    if (y < -0.25) pos.setY(i, -0.25 + (y + 0.25) * 0.25);
  }
  geo.computeVertexNormals();
  rampColours(geo, [[0, '#3a322f'], [0.5, '#62564f'], [1, '#8a7c70']], -0.4, 1.2);
  boulderGeo = geo;
  return geo;
}

let rubbleGeo: THREE.BufferGeometry | null = null;
/** Unit-radius angular rubble chunk (faceted). */
export function getRubbleGeometry(): THREE.BufferGeometry {
  if (rubbleGeo) return rubbleGeo;
  let geo: THREE.BufferGeometry = new THREE.DodecahedronGeometry(1, 1);
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  displace(geo, 0.38, 1.3, 7);
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  rampColours(geo, [[0, '#2e2725'], [0.6, '#5a4b43'], [1, '#7a6a5d']], -1, 1);
  rubbleGeo = geo;
  return geo;
}

let crystalGeo: THREE.BufferGeometry | null = null;
/** Unit-height hexagonal crystal (prism + pyramid tip), base at y=0. */
export function getCrystalGeometry(): THREE.BufferGeometry {
  if (crystalGeo) return crystalGeo;
  const prism = new THREE.CylinderGeometry(0.5, 0.42, 0.72, 6, 1, true).translate(0, 0.36, 0);
  const tip = new THREE.ConeGeometry(0.5, 0.28, 6).translate(0, 0.86, 0);
  const parts = [prism, tip].map((g) => {
    const n = g.toNonIndexed();
    n.deleteAttribute('uv');
    n.computeVertexNormals();
    return n;
  });
  const merged = mergeGeometries(parts, false)!;
  rampColours(merged, [[0, '#ffffff'], [1, '#ffffff']], 0, 1);
  // Brighter tips: scale the ramp to emphasise the point.
  const pos = merged.attributes.position!;
  const col = merged.attributes.color!;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.55 + 0.75 * Math.pow(Math.max(0, pos.getY(i)), 1.4);
    col.setXYZ(i, k, k, k);
  }
  crystalGeo = merged;
  return merged;
}

// ---------------------------------------------------------------------------
// Cave terrain.
// ---------------------------------------------------------------------------

const C = (hex: string) => new THREE.Color(hex);

const FLOOR_DUST = C('#a58c76');
const FLOOR_DARK = C('#7c6a5d');
const FLOOR_CENTRE = C('#b9a08a');
const WALL_SLOPE = C('#5a4d49');
const WALL_DARK = C('#3f3634');
const WALL_TOP = C('#857b7a');
const RIM_CLIFF = C('#6c6264');
const SEAM_HOT = C('#ff5a14');
const SEAM_WARM = C('#ff8a3a');
const STRATA_WARM = C('#7d5a42');
/**
 * Terrain vertex colours multiply the photoscanned rock albedo (a dark grey),
 * so they are authored as "final" colours and lifted by this factor.
 */
const ALBEDO_COMPENSATION = 2.6;

/** Signed lava-seam field: the seam runs along its zero isoline. */
export function seamField(layout: CavernLayout, x: number, z: number): number {
  const { noise } = layout;
  return noise.n2(x * 0.36 + 100, z * 0.36 - 50) + 0.08 * noise.n2(x * 2.2, z * 2.2);
}

/** Seams only run through solid rock, away from chambers and the rim. */
export function seamMask(layout: CavernLayout, x: number, z: number, open = layout.openDistance(x, z)): number {
  return smoothstep(0.12, 0.3, open) * smoothstep(-0.05, -0.22, layout.footprint(x, z));
}

/**
 * Glowing lava ribbons along the seam isoline (marching squares), laid on the
 * rock. Unlit HDR vertex colour, so the bloom pass turns them into hot cracks
 * that stay crisp at any zoom.
 */
export function buildSeamGeometry(layout: CavernLayout): THREE.BufferGeometry | null {
  const { bounds, noise } = layout;
  const step = 0.06;
  const nx = Math.ceil((bounds.maxX - bounds.minX) / step) + 1;
  const nz = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;
  const values = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      values[j * nx + i] = seamField(layout, bounds.minX + i * step, bounds.minZ + j * step);
    }
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const hot = C('#ff4a10');
  const white = C('#ffb070');
  const tmp = new THREE.Color();
  const pushSegment = (ax: number, az: number, bx: number, bz: number) => {
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const mask = seamMask(layout, mx, mz);
    if (mask < 0.35) return;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    // Extend slightly so neighbouring quads overlap into a continuous line.
    const ex = (dx / len) * 0.006;
    const ez = (dz / len) * 0.006;
    const widthA = (0.012 + 0.012 * (0.5 + 0.5 * noise.n2(ax * 3.7, az * 3.7))) * mask;
    const widthB = (0.012 + 0.012 * (0.5 + 0.5 * noise.n2(bx * 3.7, bz * 3.7))) * mask;
    const nxA = (-dz / len) * widthA;
    const nzA = (dx / len) * widthA;
    const nxB = (-dz / len) * widthB;
    const nzB = (dx / len) * widthB;
    const ya = layout.heightAt(ax, az) - 0.06 * seamMask(layout, ax, az) + 0.018;
    const yb = layout.heightAt(bx, bz) - 0.06 * seamMask(layout, bx, bz) + 0.018;
    const quad = [
      [ax - ex - nxA, ya, az - ez - nzA],
      [ax - ex + nxA, ya, az - ez + nzA],
      [bx + ex + nxB, yb, bz + ez + nzB],
      [bx + ex - nxB, yb, bz + ez - nzB],
    ] as const;
    for (const k of [0, 1, 2, 0, 2, 3]) positions.push(...quad[k]!);
    const heat = 0.55 + 0.45 * (0.5 + 0.5 * noise.n2(mx * 5.1 + 3, mz * 5.1));
    tmp.copy(hot).lerp(white, heat * 0.35).multiplyScalar(2.2 * heat * mask);
    for (let k = 0; k < 6; k++) colors.push(tmp.r, tmp.g, tmp.b);
  };
  const lerpEdge = (v0: number, v1: number) => v0 / (v0 - v1);
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v00 = values[j * nx + i]!;
      const v10 = values[j * nx + i + 1]!;
      const v01 = values[(j + 1) * nx + i]!;
      const v11 = values[(j + 1) * nx + i + 1]!;
      const x0 = bounds.minX + i * step;
      const z0 = bounds.minZ + j * step;
      const crossings: Array<[number, number]> = [];
      if (v00 < 0 !== v10 < 0) crossings.push([x0 + lerpEdge(v00, v10) * step, z0]);
      if (v10 < 0 !== v11 < 0) crossings.push([x0 + step, z0 + lerpEdge(v10, v11) * step]);
      if (v11 < 0 !== v01 < 0) crossings.push([x0 + (1 - lerpEdge(v11, v01)) * step, z0 + step]);
      if (v01 < 0 !== v00 < 0) crossings.push([x0, z0 + (1 - lerpEdge(v01, v00)) * step]);
      if (crossings.length >= 2) pushSegment(crossings[0]![0], crossings[0]![1], crossings[1]![0], crossings[1]![1]);
      if (crossings.length === 4) pushSegment(crossings[2]![0], crossings[2]![1], crossings[3]![0], crossings[3]![1]);
    }
  }
  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Strata bands, top to bottom (depth below the rim, thickness). */
const STRATA: ReadonlyArray<readonly [THREE.Color, number]> = [
  [C('#6b5f5c'), 0.12],
  [C('#8a6648'), 0.16],
  [C('#4c4446'), 0.1],
  [C('#9a7550'), 0.22],
  [C('#5a4e4c'), 0.12],
  [C('#7a5638'), 0.18],
  [C('#3e3839'), 0.24],
  [C('#6a4a34'), 0.2],
  [C('#2d292b'), 1.5],
];

function strataColour(depth: number, out: THREE.Color): THREE.Color {
  let acc = 0;
  for (let i = 0; i < STRATA.length; i++) {
    const [col, thick] = STRATA[i]!;
    if (depth <= acc + thick || i === STRATA.length - 1) {
      const next = STRATA[Math.min(i + 1, STRATA.length - 1)]![0];
      const f = smoothstep(acc + thick * 0.82, acc + thick, depth);
      return out.copy(col).lerp(next, f);
    }
    acc += thick;
  }
  return out.copy(STRATA[STRATA.length - 1]![0]);
}

export interface CavernTerrainOptions {
  /** Target vertex budget for the floor grid. */
  maxVertices?: number;
}

/**
 * Build the cave terrain: a heightfield clipped to the island footprint (the
 * outline is snapped onto the footprint contour, so it is organic rather than
 * stair-stepped) plus a skirt of strata cliffs hanging from its rim.
 */
export function buildCavernTerrain(
  layout: CavernLayout,
  options: CavernTerrainOptions = {},
): THREE.BufferGeometry {
  const { bounds, noise } = layout;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const maxVertices = options.maxVertices ?? 42_000;
  const cell = Math.max(0.055, Math.sqrt((width * depth) / maxVertices));
  const nx = Math.ceil(width / cell) + 1;
  const nz = Math.ceil(depth / cell) + 1;
  const idx = (i: number, j: number) => j * nx + i;

  const sdf = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      sdf[idx(i, j)] = layout.footprint(bounds.minX + i * cell, bounds.minZ + j * cell);
    }
  }

  // Triangles touching the inside of the footprint.
  const triangles: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = idx(i, j);
      const b = idx(i + 1, j);
      const c = idx(i, j + 1);
      const d = idx(i + 1, j + 1);
      const tris = (i + j) % 2 === 0 ? [[a, c, b], [b, c, d]] : [[a, c, d], [a, d, b]];
      for (const t of tris) {
        if (Math.min(sdf[t[0]!]!, sdf[t[1]!]!, sdf[t[2]!]!) < 0) triangles.push(t[0]!, t[1]!, t[2]!);
      }
    }
  }

  const remap = new Int32Array(nx * nz).fill(-1);
  const px: number[] = [];
  const pz: number[] = [];
  for (const v of triangles) {
    if (remap[v]! >= 0) continue;
    remap[v] = px.length;
    const i = v % nx;
    const j = Math.floor(v / nx);
    let x = bounds.minX + i * cell;
    let z = bounds.minZ + j * cell;
    if (sdf[v]! > 0) {
      // Snap outside vertices onto the outline.
      for (let k = 0; k < 4; k++) {
        const d = layout.footprint(x, z);
        if (Math.abs(d) < 1e-4) break;
        const n = layout.footprintNormal(x, z);
        const step = THREE.MathUtils.clamp(d, -cell * 2, cell * 2);
        x -= n.x * step;
        z -= n.z * step;
      }
    }
    px.push(x);
    pz.push(z);
  }
  const vertexCount = px.length;
  const index = triangles.map((v) => remap[v]!);

  // Heights, colours, emissive seams.
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const emissive = new Float32Array(vertexCount * 3);
  const col = new THREE.Color();
  const tmp = new THREE.Color();
  for (let v = 0; v < vertexCount; v++) {
    const x = px[v]!;
    const z = pz[v]!;
    const open = layout.openDistance(x, z);
    let y = layout.heightAt(x, z);

    // Lava seam groove (the glowing ribbon itself is `buildSeamGeometry`).
    const field = Math.abs(seamField(layout, x, z));
    const inRock = seamMask(layout, x, z, open);
    const seamCore = Math.pow(Math.max(0, 1 - field / 0.035), 2) * inRock;
    const seamHalo = Math.max(0, 1 - field / 0.12) * inRock;
    y -= 0.06 * seamCore;

    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;

    const h = y / WALL_HEIGHT;
    const grain = 0.5 + 0.5 * noise.fbm(x * 4.3 + 9, z * 4.3, 3);
    // Floor: dusty, lighter towards chamber centres.
    col.copy(FLOOR_DARK).lerp(FLOOR_DUST, grain);
    col.lerp(FLOOR_CENTRE, smoothstep(-0.18, -0.48, open) * 0.65);
    // Rock: dark slopes banded with strata, lighter weathered tops, cooler on the high rim.
    tmp.copy(WALL_DARK).lerp(WALL_SLOPE, 0.5 + 0.5 * noise.n2(x * 3.1, z * 3.1));
    const band = Math.sin((y + 0.035 * noise.n2(x * 2.4, z * 2.4)) * 46);
    tmp.lerp(STRATA_WARM, smoothstep(0.55, 0.95, band) * 0.55);
    tmp.multiplyScalar(1 - 0.18 * smoothstep(0.3, 0.9, -band));
    col.lerp(tmp, smoothstep(0.04, 0.32, h));
    tmp.copy(WALL_SLOPE).lerp(WALL_TOP, grain);
    col.lerp(tmp, smoothstep(0.62, 1.05, h) * 0.85);
    col.lerp(RIM_CLIFF, smoothstep(1.2, 1.9, h) * 0.7);
    // Scorched rock around the seam.
    col.multiplyScalar(1 - 0.35 * seamHalo);
    colors[v * 3] = col.r * ALBEDO_COMPENSATION;
    colors[v * 3 + 1] = col.g * ALBEDO_COMPENSATION;
    colors[v * 3 + 2] = col.b * ALBEDO_COMPENSATION;

    tmp.copy(SEAM_WARM).multiplyScalar(0.1 * seamHalo * seamHalo).add(col.copy(SEAM_HOT).multiplyScalar(0.35 * seamCore));
    emissive[v * 3] = tmp.r;
    emissive[v * 3 + 1] = tmp.g;
    emissive[v * 3 + 2] = tmp.b;
  }

  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  top.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  top.setAttribute('aEmissive', new THREE.BufferAttribute(emissive, 3));
  top.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
  top.setAttribute('aUvMode', new THREE.BufferAttribute(new Float32Array(vertexCount), 1));
  top.setIndex(index);
  top.computeVertexNormals();
  {
    // Slope-aware UVs: offset the planar XZ mapping by height along the
    // horizontal part of the normal. du/dx becomes ~1 + |dh/dx|, so the rock
    // scan keeps its scale up the cliffs instead of smearing into streaks,
    // and stays continuous over crests where the normal turns vertical.
    const normals = top.attributes.normal!;
    const uvs = top.attributes.uv as THREE.BufferAttribute;
    const modes = top.attributes.aUvMode as THREE.BufferAttribute;
    for (let v = 0; v < vertexCount; v++) {
      const y = positions[v * 3 + 1]!;
      uvs.setXY(v, positions[v * 3]! - 1.7 * y * normals.getX(v), positions[v * 3 + 2]! - 1.7 * y * normals.getZ(v));
      modes.setX(v, 1);
    }
  }

  // ---- Skirt: boundary edges extruded down into strata cliffs. -----------
  const edgeUse = new Map<number, { a: number; b: number; count: number }>();
  for (let t = 0; t < index.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = index[t + k]!;
      const b = index[t + ((k + 1) % 3)]!;
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      const entry = edgeUse.get(key);
      if (entry) entry.count += 1;
      else edgeUse.set(key, { a, b, count: 1 });
    }
  }
  const boundary = [...edgeUse.values()].filter((e) => e.count === 1);

  const ROWS = 9;
  const columnStart = new Map<number, number>();
  const sPos: number[] = [];
  const sCol: number[] = [];
  const sEmi: number[] = [];
  const sUv: number[] = [];
  const backAngle = Math.atan2(BACK_DIR.z, BACK_DIR.x);
  const meanRadius = Math.max(width, depth) * 0.35;
  const column = (v: number): number => {
    const existing = columnStart.get(v);
    if (existing !== undefined) return existing;
    const start = sPos.length / 3;
    columnStart.set(v, start);
    const x = positions[v * 3]!;
    const yTop = positions[v * 3 + 1]!;
    const z = positions[v * 3 + 2]!;
    const n = layout.footprintNormal(x, z);
    let angle = Math.atan2(z - layout.centre.z, x - layout.centre.x) - backAngle;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    const u = angle * meanRadius;
    for (let r = 0; r < ROWS; r++) {
      const f = r / (ROWS - 1);
      const y = r === 0 ? yTop : yTop + (BLOCK_BOTTOM - yTop) * Math.pow(f, 1.05);
      const depthBelow = Math.max(0, yTop - y) + 0.04 * noise.n2(x * 1.7 + 5, z * 1.7);
      // Rocky, slightly receding cliff; a lip just below the rim.
      const rough = r === 0 ? 0 : 0.07 * noise.n3(x * 2.6, y * 3.2, z * 2.6) + 0.035 * noise.n3(x * 7, y * 9, z * 7);
      const recede = r === 0 ? 0 : -0.03 - 0.32 * f * f;
      const out = rough + recede;
      sPos.push(x + n.x * out, y, z + n.z * out);
      if (r === 0) col.set(positions[v * 3 + 1]! > 0.1 ? '#605654' : '#6b5d55');
      else strataColour(depthBelow + 0.03 * noise.n3(x * 4, y * 4, z * 4), col);
      // Deep rock fades into the dark.
      col.multiplyScalar(1 - 0.4 * smoothstep(0.65, 1.0, f));
      sCol.push(col.r * ALBEDO_COMPENSATION, col.g * ALBEDO_COMPENSATION, col.b * ALBEDO_COMPENSATION);
      // Magma bounce from far below: a faint warm under-glow that keeps the
      // strata readable on cliffs no light reaches.
      const under = 0.035 + 0.16 * Math.pow(f, 1.6);
      // Glowing ore veins along one band, crystal flecks lower down.
      const vein = r > 0 ? Math.max(0, noise.n3(x * 1.3 + 20, y * 6, z * 1.3) - 0.55) / 0.45 : 0;
      const band = smoothstep(0.42, 0.5, depthBelow) * (1 - smoothstep(0.58, 0.66, depthBelow));
      const fleck = r > 0 ? Math.max(0, noise.n3(x * 5 - 9, y * 5, z * 5) - 0.72) / 0.28 : 0;
      const deepBand = smoothstep(0.85, 0.95, depthBelow) * (1 - smoothstep(1.05, 1.2, depthBelow));
      sEmi.push(
        1.7 * vein * band + 0.15 * fleck * deepBand + col.r * under * 1.5,
        0.55 * vein * band + 0.95 * fleck * deepBand + col.g * under * 0.9,
        0.12 * vein * band + 1.1 * fleck * deepBand + col.b * under * 0.55,
      );
      sUv.push(u, y * 1.1);
    }
    return start;
  };

  const sIndex: number[] = [];
  const a3 = new THREE.Vector3();
  const b3 = new THREE.Vector3();
  const c3 = new THREE.Vector3();
  for (const edge of boundary) {
    const ca = column(edge.a);
    const cb = column(edge.b);
    const mx = (positions[edge.a * 3]! + positions[edge.b * 3]!) / 2;
    const mz = (positions[edge.a * 3 + 2]! + positions[edge.b * 3 + 2]!) / 2;
    const outward = layout.footprintNormal(mx, mz);
    // Decide winding once per edge from the top row.
    a3.set(sPos[ca * 3]!, sPos[ca * 3 + 1]!, sPos[ca * 3 + 2]!);
    b3.set(sPos[cb * 3]!, sPos[cb * 3 + 1]!, sPos[cb * 3 + 2]!);
    c3.set(sPos[(ca + 1) * 3]!, sPos[(ca + 1) * 3 + 1]!, sPos[(ca + 1) * 3 + 2]!);
    const nrm = b3.clone().sub(a3).cross(c3.clone().sub(a3));
    const flip = nrm.x * outward.x + nrm.z * outward.z < 0;
    for (let r = 0; r < ROWS - 1; r++) {
      const a0 = ca + r;
      const a1 = ca + r + 1;
      const b0 = cb + r;
      const b1 = cb + r + 1;
      if (!flip) sIndex.push(a0, b0, a1, b0, b1, a1);
      else sIndex.push(a0, a1, b0, b0, a1, b1);
    }
  }

  const skirt = new THREE.BufferGeometry();
  const skirtCount = sPos.length / 3;
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  skirt.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3));
  skirt.setAttribute('aEmissive', new THREE.Float32BufferAttribute(sEmi, 3));
  skirt.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
  skirt.setAttribute('aUvMode', new THREE.BufferAttribute(new Float32Array(skirtCount).fill(1), 1));
  skirt.setIndex(sIndex);
  skirt.computeVertexNormals();

  const merged = mergeGeometries([top, skirt], false);
  top.dispose();
  skirt.dispose();
  if (!merged) throw new Error('cavern terrain merge failed');
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}
