import { describe, expect, it } from 'vitest';
import { edgeOffset, radialRotationY, shoreRotationY } from '../hexEdges';

describe('hexEdges', () => {
  it('edgeOffset points east for direction 0', () => {
    const o = edgeOffset(0, 1);
    expect(o.x).toBeGreaterThan(0.9);
    expect(Math.abs(o.z)).toBeLessThan(0.1);
  });

  it('shoreRotation differs from radial by ~90°', () => {
    for (let d = 0; d < 6; d++) {
      const delta = Math.abs(shoreRotationY(d) - radialRotationY(d));
      const norm = Math.min(delta % Math.PI, Math.PI - (delta % Math.PI));
      expect(norm).toBeCloseTo(Math.PI / 2, 5);
    }
  });
});
