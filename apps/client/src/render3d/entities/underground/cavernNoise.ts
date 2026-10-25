/**
 * Small deterministic value-noise kit for the underground layer.
 *
 * Visual only — seeded from the map seed so the cave looks the same on every
 * client and every reload, never used for game rules.
 */
import { createVisualRng } from '../../utils/seededVisualRandom';

export interface CavernNoise {
  /** Smooth value noise in [-1, 1]. */
  n2(x: number, z: number): number;
  /** Fractal sum of `octaves` layers, roughly in [-1, 1]. */
  fbm(x: number, z: number, octaves?: number): number;
  /** Ridged fractal in [0, 1]: sharp crests, soft valleys. */
  ridged(x: number, z: number, octaves?: number): number;
  /** 3-D value noise in [-1, 1] (cliff faces). */
  n3(x: number, y: number, z: number): number;
}

const SIZE = 256;
const MASK = SIZE - 1;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createCavernNoise(seed: number): CavernNoise {
  const rng = createVisualRng(seed);
  const values = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) values[i] = rng() * 2 - 1;
  const perm = new Uint16Array(SIZE * 2);
  const base = Array.from({ length: SIZE }, (_, i) => i);
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = base[i]!;
    base[i] = base[j]!;
    base[j] = tmp;
  }
  for (let i = 0; i < SIZE * 2; i++) perm[i] = base[i & MASK]!;

  const hash2 = (ix: number, iz: number) => values[perm[(perm[ix & MASK]! + iz) & MASK]!]!;
  const hash3 = (ix: number, iy: number, iz: number) =>
    values[perm[(perm[(perm[ix & MASK]! + iy) & MASK]! + iz) & MASK]!]!;

  const n2 = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = fade(x - ix);
    const fz = fade(z - iz);
    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  };

  const n3 = (x: number, y: number, z: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const fz = fade(z - iz);
    const x00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
    const x10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
    const x01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
    const x11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);
    return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
  };

  const fbm = (x: number, z: number, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      // Offset each octave so lattice points never line up.
      sum += amp * n2(x * freq + o * 17.3, z * freq - o * 9.1);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };

  const ridged = (x: number, z: number, octaves = 3) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const v = 1 - Math.abs(n2(x * freq + o * 31.7, z * freq + o * 4.3));
      sum += amp * v * v;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  };

  return { n2, fbm, ridged, n3 };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Polynomial smooth minimum: blends two distance fields over `k`. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
