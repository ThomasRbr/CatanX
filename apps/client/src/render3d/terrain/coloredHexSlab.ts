import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TerrainType } from '@catanx/engine';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import {
  TERRAIN_ACCENT_COLORS,
  TERRAIN_BASE_COLORS,
  TERRAIN_HIGHLIGHT_COLORS,
  TERRAIN_SIDE_COLORS,
  TERRAIN_SOIL_COLORS,
} from './TerrainCatalog';

const slabCache = new Map<string, THREE.BufferGeometry>();

/** Facet density — smooth enough for cinematic zoom without chunky triangles. */
const SEG_SOFT = 24;
const SEG_DENSE = 32;

const SURFACE_REV = 'hex-surf-v18-collector';

type PaintStyle =
  | 'wheat' // parallel gold bands + furrows
  | 'moss' // soft forest clearings
  | 'dune' // sand crests / troughs
  | 'meadow' // clover islands on green
  | 'plate' // rock plates (voronoi)
  | 'clay' // hill ochre clumps
  | 'water'
  | 'ash' // volcanic scorched plates + ember flecks
  | 'ice' // glacial blue-white plates
  | 'marsh' // swamp mottled wet earth
  | 'sanctum' // soft sacred rings
  | 'vein'; // goldmine rock with ore flecks

interface SurfaceProfile {
  amp: number;
  freq: number;
  paint: PaintStyle;
  bowl: number;
  segments: number;
}

const PROFILE: Record<TerrainType, SurfaceProfile> = {
  plains: { amp: 0.046, freq: 5.8, paint: 'wheat', bowl: 0.008, segments: SEG_SOFT },
  forest: { amp: 0.05, freq: 3.6, paint: 'moss', bowl: -0.006, segments: SEG_SOFT },
  mountain: { amp: 0.085, freq: 6.2, paint: 'plate', bowl: 0.016, segments: SEG_DENSE },
  hill: { amp: 0.055, freq: 4.2, paint: 'clay', bowl: 0.012, segments: SEG_SOFT },
  pasture: { amp: 0.042, freq: 3.4, paint: 'meadow', bowl: 0.005, segments: SEG_SOFT },
  desert: { amp: 0.048, freq: 5.6, paint: 'dune', bowl: 0.003, segments: SEG_SOFT },
  coast: { amp: 0.026, freq: 3.2, paint: 'dune', bowl: -0.008, segments: SEG_SOFT },
  ocean: { amp: 0.01, freq: 2.2, paint: 'water', bowl: -0.012, segments: SEG_SOFT },
  river: { amp: 0.012, freq: 2.8, paint: 'water', bowl: -0.01, segments: SEG_SOFT },
  swamp: { amp: 0.04, freq: 3.0, paint: 'marsh', bowl: -0.014, segments: SEG_SOFT },
  volcano: { amp: 0.07, freq: 5.2, paint: 'ash', bowl: 0.02, segments: SEG_DENSE },
  tundra: { amp: 0.03, freq: 3.4, paint: 'meadow', bowl: 0.004, segments: SEG_SOFT },
  jungle: { amp: 0.052, freq: 4.0, paint: 'moss', bowl: -0.007, segments: SEG_SOFT },
  goldmine: { amp: 0.058, freq: 5.0, paint: 'vein', bowl: 0.01, segments: SEG_DENSE },
  sacred: { amp: 0.026, freq: 2.8, paint: 'sanctum', bowl: 0.01, segments: SEG_SOFT },
  ruins: { amp: 0.04, freq: 3.6, paint: 'clay', bowl: -0.004, segments: SEG_SOFT },
  glacier: { amp: 0.042, freq: 4.2, paint: 'ice', bowl: 0.012, segments: SEG_DENSE },
  lake: { amp: 0.01, freq: 2.4, paint: 'water', bowl: -0.012, segments: SEG_SOFT },
};

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, freq: number): number {
  return valueNoise(x * freq, z * freq) * 0.62 + valueNoise(x * freq * 2.1 + 3, z * freq * 2.1) * 0.38;
}

/** Cellular / worley — returns [F1, F2] for plate edges. */
function worley(x: number, z: number, scale: number): [number, number] {
  const sx = x * scale;
  const sz = z * scale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  let f1 = 99;
  let f2 = 99;
  for (let jz = -1; jz <= 1; jz++) {
    for (let jx = -1; jx <= 1; jx++) {
      const cx = ix + jx;
      const cz = iz + jz;
      const px = cx + hash2(cx * 1.7, cz * 2.3);
      const pz = cz + hash2(cx * 3.1, cz * 1.9);
      const d = Math.hypot(sx - px, sz - pz);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return [f1, f2];
}

function hexCorner(i: number, radius: number): THREE.Vector3 {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return new THREE.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
}

function distToHexEdge(x: number, z: number, radius: number): number {
  let min = Infinity;
  for (let i = 0; i < 6; i++) {
    const a = hexCorner(i, radius);
    const b = hexCorner((i + 1) % 6, radius);
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = x - a.x;
    const apz = z - a.z;
    const abLen2 = abx * abx + abz * abz;
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / Math.max(1e-8, abLen2)));
    const cx = a.x + abx * t - x;
    const cz = a.z + abz * t - z;
    min = Math.min(min, Math.hypot(cx, cz));
  }
  return min;
}

/** Shared deterministic relief sampler used by both the mesh and placed entities. */
export function sampleTerrainRelief(
  terrain: TerrainType,
  x: number,
  z: number,
  radius = HEX_WORLD_RADIUS,
): number {
  const p = PROFILE[terrain] ?? PROFILE.pasture;
  const n1 = valueNoise(x * p.freq, z * p.freq);
  const n2 = valueNoise(x * p.freq * 2.15 + 2.4, z * p.freq * 2.15 + 1.1);
  let h = 0;

  switch (p.paint) {
    case 'wheat': {
      // Deep plow grooves — readable from ortho camera.
      const row = Math.sin(x * p.freq * 1.65 + z * p.freq * 0.22);
      h = row * 0.85 + (n1 - 0.5) * 0.28 + Math.sin(x * 2.2 + z * 0.4) * 0.12;
      break;
    }
    case 'moss': {
      h = (n1 - 0.5) * 1.05 + (n2 - 0.5) * 0.55;
      // Soft clearings (negative bowls) + root bumps.
      const clear = Math.pow(Math.max(0, 0.62 - fbm(x, z, 1.8)), 1.5);
      h -= clear * 0.9;
      h += Math.pow(Math.max(0, n2 - 0.68), 1.7) * 1.2;
      break;
    }
    case 'dune': {
      const wave =
        Math.sin(x * p.freq * 1.35 + z * p.freq * 0.38) * 0.72 +
        Math.sin(x * p.freq * -0.42 + z * p.freq * 1.4) * 0.38;
      h = wave + (n1 - 0.5) * 0.22;
      break;
    }
    case 'meadow': {
      h = (n1 - 0.5) * 0.85 + (n2 - 0.5) * 0.45;
      // Gentle clover mounds.
      const [f1] = worley(x, z, 2.8);
      h += Math.pow(Math.max(0, 0.55 - f1), 1.4) * 0.7;
      break;
    }
    case 'plate': {
      const [f1, f2] = worley(x, z, 3.4);
      const edge = f2 - f1;
      h = (0.5 - f1) * 1.4 + (n1 - 0.5) * 0.35;
      // Crack lines between plates sit lower.
      h -= Math.pow(Math.max(0, 0.12 - edge), 1.5) * 2.2;
      break;
    }
    case 'clay': {
      h = Math.pow(Math.max(0, n1 - 0.3), 1.3) * 1.7 - 0.2;
      h += (n2 - 0.5) * 0.4;
      break;
    }
    case 'water':
      h = (n1 - 0.5) * 0.28 + Math.sin(x * 2.0 + z * 1.5) * 0.1;
      break;
  }

  const radial = Math.hypot(x, z) / Math.max(1e-6, radius);
  h += (1 - radial * radial) * (p.bowl / Math.max(0.012, p.amp));

  // Physical tile bevel: outer lip slightly raised then flat seam.
  const edge = distToHexEdge(x, z, radius);
  const bevel = THREE.MathUtils.smoothstep(edge, radius * 0.1, radius * 0.18);
  h += (1 - bevel) * 0.15; // tiny raised rim in relief-space

  const fade = THREE.MathUtils.smoothstep(edge, 0.012, radius * 0.1);
  return h * p.amp * fade;
}

const _base = new THREE.Color();
const _accent = new THREE.Color();
const _hi = new THREE.Color();
const _soil = new THREE.Color();
const _tmp = new THREE.Color();

/**
 * Hand-painted miniature albedo — motif follows biome, not generic noise mush.
 */
function sampleTopColor(
  terrain: TerrainType,
  x: number,
  z: number,
  height: number,
  radius: number,
  out: THREE.Color,
): void {
  const p = PROFILE[terrain] ?? PROFILE.pasture;
  _base.set(TERRAIN_BASE_COLORS[terrain] ?? '#8899aa');
  _accent.set(TERRAIN_ACCENT_COLORS[terrain] ?? '#778899');
  _hi.set(TERRAIN_HIGHLIGHT_COLORS[terrain] ?? '#99aabb');
  _soil.set(TERRAIN_SOIL_COLORS[terrain] ?? '#667788');
  out.copy(_base);

  const lift = THREE.MathUtils.clamp(height / Math.max(0.014, p.amp), -1.2, 1.2);

  switch (p.paint) {
    case 'wheat': {
      // Gold band between furrows; soil in the groove.
      const row = Math.sin(x * p.freq * 1.65 + z * p.freq * 0.22);
      const band = row * 0.5 + 0.5;
      out.lerp(_hi, band * 0.55);
      out.lerp(_accent, (1 - band) * 0.45);
      if (row < -0.35) out.lerp(_soil, (-row - 0.35) * 1.1);
      // Occasional dry stalk flecks along rows.
      if (hash2(x * 14, z * 9) > 0.92) out.lerp(_hi, 0.5);
      break;
    }
    case 'moss': {
      // Large moss domains + earthen clearings.
      const moss = fbm(x, z, 1.9);
      out.lerp(_accent, THREE.MathUtils.smoothstep(moss, 0.35, 0.75) * 0.7);
      const clear = fbm(x + 5, z - 3, 2.4);
      if (clear > 0.62) out.lerp(_soil, (clear - 0.62) * 1.6);
      // Lichen flecks on raised moss.
      if (lift > 0.2 && hash2(x * 12, z * 10) > 0.88) out.lerp(_hi, 0.45);
      else if (hash2(x * 8, z * 7) < 0.08) out.lerp(_soil, 0.35);
      break;
    }
    case 'dune': {
      const wave = Math.sin(x * p.freq * 1.35 + z * p.freq * 0.38);
      const crest = wave * 0.5 + 0.5;
      out.lerp(_hi, crest * 0.5);
      out.lerp(_accent, (1 - crest) * 0.4);
      if (wave < -0.4) out.lerp(_soil, (-wave - 0.4) * 0.9);
      // Wind grit.
      if (hash2(x * 16, z * 13) > 0.93) out.lerp(_hi, 0.35);
      break;
    }
    case 'meadow': {
      out.lerp(_hi, 0.12);
      const [f1] = worley(x, z, 2.8);
      // Clover / flower islands.
      if (f1 < 0.38) {
        out.lerp(_accent, (0.38 - f1) * 1.8);
        if (f1 < 0.18) out.lerp(_hi, (0.18 - f1) * 2.2);
      }
      // Path of bare earth between clumps.
      const path = fbm(x, z, 3.2);
      if (path > 0.72) out.lerp(_soil, (path - 0.72) * 1.4);
      if (hash2(x * 11, z * 9) > 0.91) out.lerp(_hi, 0.4);
      break;
    }
    case 'plate': {
      const [f1, f2] = worley(x, z, 3.4);
      const edge = f2 - f1;
      // Each plate gets a slight tone from cell id.
      const cell = hash2(Math.floor(x * 3.4 + f1 * 10), Math.floor(z * 3.4 + f2 * 10));
      out.lerp(_accent, cell * 0.35);
      out.lerp(_hi, (1 - f1) * 0.25);
      // Dark cracks between plates (material, not light).
      if (edge < 0.1) out.lerp(_soil, (0.1 - edge) * 4.5);
      if (hash2(x * 18, z * 15) > 0.94) out.lerp(_hi, 0.4);
      break;
    }
    case 'clay': {
      const mound = fbm(x, z, 2.2);
      out.lerp(_accent, mound * 0.55);
      out.lerp(_hi, Math.max(0, lift) * 0.35);
      if (lift < -0.15) out.lerp(_soil, -lift * 0.55);
      // Stone grit.
      if (hash2(x * 13, z * 11) > 0.9) out.lerp(_soil, 0.45);
      else if (hash2(x * 9, z * 14) > 0.93) out.lerp(_hi, 0.35);
      break;
    }
    case 'water': {
      const w = fbm(x, z, 2.0);
      out.lerp(_accent, w * 0.35);
      out.lerp(_hi, (1 - w) * 0.2);
      break;
    }
    case 'ash': {
      const [f1, f2] = worley(x, z, 3.6);
      const edge = f2 - f1;
      out.lerp(_accent, f1 * 0.55);
      out.lerp(_soil, (1 - f1) * 0.35);
      if (edge < 0.12) out.lerp(_soil, (0.12 - edge) * 3.5);
      // Lava rivulets / ember flecks.
      if (edge < 0.09 && hash2(x * 20, z * 17) > 0.72) out.lerp(_hi, 0.75);
      if (f1 < 0.2 && hash2(x * 9, z * 11) > 0.85) out.lerp(_hi, 0.55);
      break;
    }
    case 'ice': {
      const [f1, f2] = worley(x, z, 2.6);
      const edge = f2 - f1;
      out.lerp(_hi, 0.45 + (1 - f1) * 0.4);
      out.lerp(_accent, f1 * 0.3);
      if (edge < 0.09) out.lerp(_soil, (0.09 - edge) * 2.2);
      // Snow drifts.
      if (hash2(x * 14, z * 12) > 0.78) out.lerp(_hi, 0.65);
      break;
    }
    case 'marsh': {
      const wet = fbm(x, z, 2.0);
      out.lerp(_accent, wet * 0.35);
      out.lerp(_soil, (1 - wet) * 0.55);
      // Dull stagnant pools.
      const [f1] = worley(x, z, 2.2);
      if (f1 < 0.32) {
        out.lerp(_hi, (0.32 - f1) * 0.9);
        out.offsetHSL(-0.02, -0.08, -0.06);
      }
      if (hash2(x * 10, z * 8) < 0.12) out.lerp(_soil, 0.5);
      out.offsetHSL(0, -0.06, -0.04);
      break;
    }
    case 'sanctum': {
      const ring = Math.hypot(x, z);
      const band = Math.abs(Math.sin(ring * 9.5));
      out.lerp(_hi, 0.2);
      out.lerp(_accent, band * 0.45);
      if (ring < 0.22) out.lerp(_hi, (0.22 - ring) * 1.4);
      if (hash2(x * 9, z * 11) > 0.92) out.lerp(_hi, 0.4);
      break;
    }
    case 'vein': {
      const [f1, f2] = worley(x, z, 3.5);
      const edge = f2 - f1;
      out.lerp(_accent, f1 * 0.4);
      out.lerp(_soil, (1 - f1) * 0.3);
      if (edge < 0.1) out.lerp(_soil, (0.1 - edge) * 4);
      // Ore glitter in cracks.
      if (edge < 0.07 && hash2(x * 22, z * 19) > 0.75) out.lerp(_hi, 0.65);
      break;
    }
  }

  // Universal material response to relief (subtle).
  if (lift > 0.25) out.lerp(_hi, Math.min(0.22, (lift - 0.25) * 0.35));
  if (lift < -0.25) out.lerp(_soil, Math.min(0.28, (-lift - 0.25) * 0.4));

  // Carved tile rim — warm earth lip, not a dirty AO ring.
  const edgeDist = distToHexEdge(x, z, radius);
  const rim = 1 - THREE.MathUtils.smoothstep(edgeDist, 0.02, radius * 0.14);
  if (rim > 0.002) {
    _tmp.copy(_soil);
    out.lerp(_tmp, rim * 0.22);
    out.offsetHSL(0.01 * rim, 0.02 * rim, -0.02 * rim);
  }

  // Brush micro-variation.
  const brush = (hash2(x * 4.2 + 1.1, z * 3.7) - 0.5) * 0.028;
  out.offsetHSL(brush * 0.5, brush * 0.6, brush);
}

function pushTri(
  positions: number[],
  colors: number[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  ca: THREE.Color,
  cb: THREE.Color,
  cc: THREE.Color,
): void {
  positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
}

export function buildDetailedHexSlab(
  terrain: TerrainType,
  radius = HEX_WORLD_RADIUS,
  thickness = HEX_SLAB_THICKNESS,
  oversize = 1.015,
): THREE.BufferGeometry {
  const r = radius * oversize;
  const profile = PROFILE[terrain] ?? PROFILE.pasture;
  const seg = profile.segments;
  const positions: number[] = [];
  const colors: number[] = [];
  const topY = thickness;
  const bottomY = 0;

  const center = new THREE.Vector3(0, 0, 0);
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const cC = new THREE.Color();
  const sideCol = new THREE.Color(TERRAIN_SIDE_COLORS[terrain] ?? '#667788');
  const sideTop = sideCol.clone().offsetHSL(0.02, 0.04, 0.1);
  const sideMid = sideCol.clone().offsetHSL(0.01, 0.06, 0.02);
  const sideBot = sideCol.clone().offsetHSL(-0.01, -0.04, -0.12);
  const bottomCol = sideCol.clone().offsetHSL(0, -0.06, -0.16);

  const heightAt = (x: number, z: number) => sampleTerrainRelief(terrain, x, z, r);

  for (let wedge = 0; wedge < 6; wedge++) {
    const p0 = center;
    const p1 = hexCorner(wedge, r);
    const p2 = hexCorner((wedge + 1) % 6, r);

    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg - i; j++) {
        const u0 = i / seg;
        const v0 = j / seg;
        const u1 = (i + 1) / seg;
        const v1 = (j + 1) / seg;

        const lerp = (u: number, v: number) => {
          const w = 1 - u - v;
          return {
            x: p0.x * w + p1.x * u + p2.x * v,
            z: p0.z * w + p1.z * u + p2.z * v,
          };
        };

        const a = lerp(u0, v0);
        const b = lerp(u1, v0);
        const c = lerp(u0, v1);
        const ha = heightAt(a.x, a.z);
        const hb = heightAt(b.x, b.z);
        const hc = heightAt(c.x, c.z);
        sampleTopColor(terrain, a.x, a.z, ha, r, cA);
        sampleTopColor(terrain, b.x, b.z, hb, r, cB);
        sampleTopColor(terrain, c.x, c.z, hc, r, cC);
        pushTri(
          positions,
          colors,
          a.x,
          topY + ha,
          a.z,
          c.x,
          topY + hc,
          c.z,
          b.x,
          topY + hb,
          b.z,
          cA,
          cC,
          cB,
        );

        if (i + j + 1 < seg) {
          const d = lerp(u1, v1);
          const hd = heightAt(d.x, d.z);
          sampleTopColor(terrain, d.x, d.z, hd, r, cA);
          sampleTopColor(terrain, b.x, b.z, hb, r, cB);
          sampleTopColor(terrain, c.x, c.z, hc, r, cC);
          pushTri(
            positions,
            colors,
            b.x,
            topY + hb,
            b.z,
            c.x,
            topY + hc,
            c.z,
            d.x,
            topY + hd,
            d.z,
            cB,
            cC,
            cA,
          );
        }
      }
    }
  }

  // Three-band carved cliff (premium miniature piece).
  const y1 = thickness * 0.28;
  const y2 = thickness * 0.62;
  for (let i = 0; i < 6; i++) {
    const a = hexCorner(i, r);
    const b = hexCorner((i + 1) % 6, r);
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg;
      const t1 = (s + 1) / seg;
      const ax = a.x + (b.x - a.x) * t0;
      const az = a.z + (b.z - a.z) * t0;
      const bx = a.x + (b.x - a.x) * t1;
      const bz = a.z + (b.z - a.z) * t1;
      const ha = heightAt(ax, az);
      const hb = heightAt(bx, bz);

      const band = (
        yLo: number,
        yHiA: number,
        yHiB: number,
        cLo: THREE.Color,
        cHi: THREE.Color,
      ) => {
        pushTri(positions, colors, ax, yLo, az, bx, yLo, bz, bx, yHiB, bz, cLo, cLo, cHi);
        pushTri(positions, colors, ax, yLo, az, bx, yHiB, bz, ax, yHiA, az, cLo, cHi, cHi);
      };

      band(bottomY, y1, y1, sideBot, sideMid);
      band(y1, y2, y2, sideMid, sideTop);
      band(y2, topY + ha, topY + hb, sideTop, sideTop);
    }
  }

  for (let i = 0; i < 6; i++) {
    const a = hexCorner(i, r);
    const b = hexCorner((i + 1) % 6, r);
    pushTri(
      positions,
      colors,
      0,
      bottomY,
      0,
      a.x,
      bottomY,
      a.z,
      b.x,
      bottomY,
      b.z,
      bottomCol,
      bottomCol,
      bottomCol,
    );
  }

  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  raw.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const uvs = new Float32Array((positions.length / 3) * 2);
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const x = positions[vertex * 3] ?? 0;
    const z = positions[vertex * 3 + 2] ?? 0;
    uvs[vertex * 2] = x / (r * 2) + 0.5;
    uvs[vertex * 2 + 1] = z / (r * 2) + 0.5;
  }
  raw.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const geo = mergeVertices(raw, 1e-5);
  raw.dispose();
  const uv = geo.getAttribute('uv');
  if (uv) geo.setAttribute('uv1', uv.clone());
  geo.computeVertexNormals();
  return geo;
}

export function getColoredHexSlab(
  topHex: string,
  sideHex: string,
  radius = HEX_WORLD_RADIUS,
  thickness = HEX_SLAB_THICKNESS,
  terrain: TerrainType = 'pasture',
): THREE.BufferGeometry {
  const key = `${SURFACE_REV}|${terrain}|${topHex}|${sideHex}|${radius}|${thickness}`;
  let geo = slabCache.get(key);
  if (geo) return geo;
  geo = buildDetailedHexSlab(terrain, radius, thickness);
  slabCache.set(key, geo);
  return geo;
}

export function clearColoredHexSlabCache(): void {
  for (const geo of slabCache.values()) geo.dispose();
  slabCache.clear();
}
