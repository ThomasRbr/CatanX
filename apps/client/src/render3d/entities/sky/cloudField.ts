import * as THREE from 'three';
import { createVisualRng } from '../../utils/seededVisualRandom';

/**
 * Tileable cloud-top height field, generated once on the CPU.
 *
 * The cloud deck used to evaluate domain-warped fbm and cellular noise five
 * times per pixel. That looked right but compiled into a huge unrolled HLSL
 * program under ANGLE (a multi-second stall when entering the sky layer) and
 * cost a lot of fill rate. Baking the field into a half-float texture keeps the
 * same shapes — fbm coverage, round cumulus domes, small cauliflower puffs —
 * for a dozen texture taps, with mipmaps handling distance filtering for free.
 *
 * Everything is periodic over the tile so the texture wraps seamlessly.
 */

export const CLOUD_FIELD_SIZE = 512;
/** World units covered by one repeat of the texture. */
export const CLOUD_FIELD_TILE = 20;

let cached: THREE.DataTexture | null = null;

function periodicValueNoise(period: number, seed: number) {
  const rng = createVisualRng(seed);
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = lattice[y0 * period + x0]!;
    const b = lattice[y0 * period + x1]!;
    const c = lattice[y1 * period + x0]!;
    const d = lattice[y1 * period + x1]!;
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

/** fbm over [0,1)² with `base` cycles at the first octave, periodic. */
function periodicFbm(base: number, octaves: number, seed: number) {
  const layers = Array.from({ length: octaves }, (_, i) => ({
    period: base * 2 ** i,
    noise: periodicValueNoise(base * 2 ** i, seed + i * 101),
    amplitude: 0.5 ** (i + 1),
  }));
  const norm = layers.reduce((sum, layer) => sum + layer.amplitude, 0);
  return (u: number, v: number) => {
    let value = 0;
    for (const layer of layers) value += layer.noise(u * layer.period, v * layer.period) * layer.amplitude;
    return value / norm;
  };
}

/**
 * Heaped cumulus blobs over [0,1)², periodic: one dome of random radius and
 * height per cell, blended with a smooth maximum so neighbouring domes merge
 * into a cauliflower mass instead of meeting at hard Voronoi creases.
 */
function periodicBlobs(cells: number, seed: number) {
  const rng = createVisualRng(seed);
  const data = new Float32Array(cells * cells * 4);
  for (let i = 0; i < cells * cells; i++) {
    data[i * 4] = 0.15 + rng() * 0.7;
    data[i * 4 + 1] = 0.15 + rng() * 0.7;
    data[i * 4 + 2] = 0.7 + rng() * 0.75; // radius, in cells
    data[i * 4 + 3] = 0.55 + rng() * 0.45; // crown height
  }
  const k = 9;
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const wx = ((cx % cells) + cells) % cells;
        const wy = ((cy % cells) + cells) % cells;
        const index = (wy * cells + wx) * 4;
        const px = cx + data[index]! - x;
        const py = cy + data[index + 1]! - y;
        const r = data[index + 2]!;
        const t = 1 - (px * px + py * py) / (r * r);
        const dome = t > 0 ? Math.sqrt(t) * data[index + 3]! : 0;
        sum += Math.exp(k * dome);
      }
    }
    // Smooth max; subtract the baseline contributed by the 9 empty terms.
    return Math.max(0, Math.log(Math.max(1, sum - 8)) / k);
  };
}

/**
 * R: cloud-top height in [0, 1] (0 = deep gap between masses).
 * Shared by the deck and the wisp layer.
 */
export function cloudFieldTexture(): THREE.DataTexture {
  if (cached) return cached;
  const size = CLOUD_FIELD_SIZE;
  const cover = periodicFbm(6, 5, 7101);
  const warpX = periodicFbm(3, 3, 9203);
  const warpY = periodicFbm(3, 3, 4407);
  const big = periodicBlobs(9, 3301);
  const mid = periodicBlobs(22, 5507);
  const small = periodicBlobs(54, 8803);
  const data = new Uint16Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Domain warp (periodic: the displacement itself wraps).
      const wu = u + (warpX(u, v) - 0.5) * 0.09;
      const wv = v + (warpY(u, v) - 0.5) * 0.09;
      const base = cover(((wu % 1) + 1) % 1, ((wv % 1) + 1) % 1);
      // Heaps of three sizes; the bank edges follow the heaps too, so the
      // border between cloud and gap is lumpy rather than a smooth contour.
      const heaps = 0.5 * big(u, v) + 0.32 * mid(u, v) + 0.18 * small(u, v);
      const raw = (base - 0.5) * 2.6 + heaps * 1.2 - 0.2;
      const t = Math.min(1, Math.max(0, raw / 0.7));
      // Rounded shoulders: steep enough to read as puffs, never a cliff.
      const height = t * t * (3 - 2 * t) * (0.55 + 0.45 * heaps);
      data[y * size + x] = THREE.DataUtils.toHalfFloat(height);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.HalfFloatType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  cached = texture;
  return texture;
}
