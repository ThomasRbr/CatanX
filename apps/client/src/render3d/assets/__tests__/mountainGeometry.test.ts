import { describe, expect, it } from 'vitest';
import {
  createPeakMassifGeometry,
  createPeakRidgeGeometry,
  createPeakSpireGeometry,
} from '../meshCatalog';

describe('mountain radial geometry', () => {
  it.each([
    ['spire', createPeakSpireGeometry],
    ['massif', createPeakMassifGeometry],
    ['ridge', createPeakRidgeGeometry],
  ] as const)('builds %s without a deep vertical skirt', (_name, build) => {
    const geometry = build();
    const position = geometry.getAttribute('position');
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < position.count; index++) {
      minimumY = Math.min(minimumY, position.getY(index));
      maximumY = Math.max(maximumY, position.getY(index));
    }
    expect(position.count).toBeGreaterThan(1_000);
    // Leaning summit tips may dip a few centimetres below their local origin,
    // but there must never be a deep hidden skirt.
    expect(minimumY).toBeGreaterThan(-0.07);
    expect(maximumY).toBeGreaterThan(0.55);
    expect(geometry.boundingBox).not.toBeNull();
    geometry.dispose();
  });
});
