/**
 * Deterministic PRNG for visual-only decoration (never for game rules).
 * Same seed + tileId + layer → same sequence.
 */

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mixSeeds(...parts: Array<string | number>): number {
  return hashString(parts.map(String).join('::'));
}

/** Mulberry32 — returns fn in [0, 1). */
export function createVisualRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function visualRngFor(
  mapSeed: number,
  tileId: string,
  layer: string,
): () => number {
  return createVisualRng(mixSeeds(mapSeed, tileId, layer));
}

export function rngRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function rngInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  if (maxInclusive <= minInclusive) return minInclusive;
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.min(span - 1, Math.floor(rng() * span));
}
