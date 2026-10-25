import { describe, expect, it } from 'vitest';
import { buildBarbarianCoastRoute, convexHull, offsetConvexPolygon } from './barbarianCoastRoute';

describe('barbarian coastal route', () => {
  const island = [
    { x: -1, z: -1 },
    { x: 1, z: -1 },
    { x: 1.2, z: 0.6 },
    { x: 0, z: 1.2 },
    { x: -1.1, z: 0.5 },
    { x: 0, z: 0 },
  ];

  it('keeps only the exterior coastline', () => {
    expect(convexHull(island)).toHaveLength(5);
  });

  it('creates one marker for every track state including departure', () => {
    const route = buildBarbarianCoastRoute(island, 7, 0.45);
    expect(route).toHaveLength(8);
    expect(new Set(route.map((point) => `${point.x.toFixed(3)}:${point.z.toFixed(3)}`)).size).toBe(
      8,
    );
  });

  it('keeps the route controls outside the land hull', () => {
    const expanded = offsetConvexPolygon(
      [
        { x: -1, z: -1 },
        { x: 1, z: -1 },
        { x: 1, z: 1 },
        { x: -1, z: 1 },
      ],
      0.5,
    );
    expect(expanded).toEqual([
      { x: -1.5, z: -1.5 },
      { x: 1.5, z: -1.5 },
      { x: 1.5, z: 1.5 },
      { x: -1.5, z: 1.5 },
    ]);
  });
});
