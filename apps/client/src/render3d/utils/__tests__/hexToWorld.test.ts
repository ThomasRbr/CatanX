import { describe, expect, it } from 'vitest';
import { HEX_DIRECTIONS, type CubeCoord } from '@catanx/engine';
import {
  assertHexToWorldMatchesPixel,
  cubeToWorld,
  hexToWorld,
} from '../hexToWorld';

describe('hexToWorld', () => {
  it('matches hexToPixel for the origin', () => {
    const { ok, world, pixel } = assertHexToWorldMatchesPixel({ q: 0, r: 0, s: 0 });
    expect(ok).toBe(true);
    expect(world.x).toBeCloseTo(pixel.x, 9);
    expect(world.z).toBeCloseTo(pixel.y, 9);
    expect(world.y).toBe(0);
  });

  it('matches hexToPixel for all six neighbors', () => {
    for (const dir of HEX_DIRECTIONS) {
      const coord: CubeCoord = { q: dir.q, r: dir.r, s: dir.s };
      const { ok } = assertHexToWorldMatchesPixel(coord);
      expect(ok).toBe(true);
    }
  });

  it('matches hexToPixel for a classic ring sample', () => {
    const samples: CubeCoord[] = [
      { q: 2, r: -1, s: -1 },
      { q: -2, r: 0, s: 2 },
      { q: 0, r: 3, s: -3 },
      { q: 1, r: -3, s: 2 },
    ];
    for (const coord of samples) {
      expect(assertHexToWorldMatchesPixel(coord).ok).toBe(true);
    }
  });

  it('scales linearly with radius', () => {
    const a = hexToWorld(1, 0, 1);
    const b = hexToWorld(1, 0, 2);
    expect(b.x).toBeCloseTo(a.x * 2, 9);
    expect(b.z).toBeCloseTo(a.z * 2, 9);
  });

  it('cubeToWorld delegates to axial axes', () => {
    const coord = { q: 1, r: -1, s: 0 };
    expect(cubeToWorld(coord)).toEqual(hexToWorld(1, -1));
  });
});
