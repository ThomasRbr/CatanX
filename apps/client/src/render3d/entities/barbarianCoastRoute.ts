export interface CoastRoutePoint {
  x: number;
  z: number;
}

function cross(origin: CoastRoutePoint, a: CoastRoutePoint, b: CoastRoutePoint): number {
  return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
}

export function convexHull(points: readonly CoastRoutePoint[]): CoastRoutePoint[] {
  const unique = [...new Map(points.map((point) => [`${point.x}:${point.z}`, point])).values()];
  if (unique.length <= 2) return unique;
  unique.sort((a, b) => a.x - b.x || a.z - b.z);
  const lower: CoastRoutePoint[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: CoastRoutePoint[] = [];
  for (let index = unique.length - 1; index >= 0; index--) {
    const point = unique[index]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Expands a counter-clockwise convex polygon by a constant maritime clearance. */
export function offsetConvexPolygon(
  polygon: readonly CoastRoutePoint[],
  distance: number,
): CoastRoutePoint[] {
  if (polygon.length < 3) return polygon.map((point) => ({ ...point }));
  return polygon.map((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const next = polygon[(index + 1) % polygon.length]!;
    const previousLength = Math.hypot(point.x - previous.x, point.z - previous.z) || 1;
    const nextLength = Math.hypot(next.x - point.x, next.z - point.z) || 1;
    const previousNormal = {
      x: (point.z - previous.z) / previousLength,
      z: -(point.x - previous.x) / previousLength,
    };
    const nextNormal = {
      x: (next.z - point.z) / nextLength,
      z: -(next.x - point.x) / nextLength,
    };
    const bisectorLength =
      Math.hypot(previousNormal.x + nextNormal.x, previousNormal.z + nextNormal.z) || 1;
    const bisector = {
      x: (previousNormal.x + nextNormal.x) / bisectorLength,
      z: (previousNormal.z + nextNormal.z) / bisectorLength,
    };
    const projection = Math.max(
      0.24,
      bisector.x * previousNormal.x + bisector.z * previousNormal.z,
    );
    const miter = distance / projection;
    return { x: point.x + bisector.x * miter, z: point.z + bisector.z * miter };
  });
}

function resamplePolyline(points: readonly CoastRoutePoint[], count: number): CoastRoutePoint[] {
  if (points.length === 0) return [];
  if (points.length === 1 || count <= 1) return [{ ...points[0]! }];
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    lengths.push(lengths[index - 1]! + Math.hypot(current.x - previous.x, current.z - previous.z));
  }
  const total = lengths[lengths.length - 1]!;
  if (total <= 0.0001) return Array.from({ length: count }, () => ({ ...points[0]! }));

  return Array.from({ length: count }, (_, sampleIndex) => {
    const target = (sampleIndex / (count - 1)) * total;
    let segment = 1;
    while (segment < lengths.length - 1 && lengths[segment]! < target) segment++;
    const startLength = lengths[segment - 1]!;
    const endLength = lengths[segment]!;
    const amount = endLength > startLength ? (target - startLength) / (endLength - startLength) : 0;
    const start = points[segment - 1]!;
    const end = points[segment]!;
    return {
      x: start.x + (end.x - start.x) * amount,
      z: start.z + (end.z - start.z) * amount,
    };
  });
}

/**
 * Builds a readable approach route outside the convex coastline.
 * The first buoy starts in deep water; the final beacon closes on the island.
 */
export function buildBarbarianCoastRoute(
  tileCenters: readonly CoastRoutePoint[],
  trackLength: number,
  coastOffset: number,
): CoastRoutePoint[] {
  const count = Math.max(2, Math.floor(trackLength) + 1);
  const hull = convexHull(tileCenters);
  if (hull.length === 0) return [];

  const center = hull.reduce(
    (sum, point) => ({ x: sum.x + point.x / hull.length, z: sum.z + point.z / hull.length }),
    { x: 0, z: 0 },
  );
  if (hull.length < 3) {
    const radius = Math.max(coastOffset * 2.2, 0.5);
    return Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * (0.2 + (index / (count - 1)) * 1.35);
      return { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
    });
  }

  const expandedHull = offsetConvexPolygon(hull, coastOffset);
  const startIndex = expandedHull.reduce((best, point, index) => {
    const current = expandedHull[best]!;
    return point.x + point.z < current.x + current.z ? index : best;
  }, 0);
  const ordered = Array.from(
    { length: expandedHull.length },
    (_, index) => expandedHull[(startIndex + index) % expandedHull.length]!,
  );
  const coastCount = Math.max(3, Math.ceil(ordered.length * 0.82));
  const selected = ordered.slice(0, coastCount);

  const offsetPoint = (point: CoastRoutePoint, offset: number): CoastRoutePoint => {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: point.x + (dx / length) * offset, z: point.z + (dz / length) * offset };
  };
  const polyline = [
    offsetPoint(selected[0]!, coastOffset * 0.7),
    ...selected,
    offsetPoint(selected[selected.length - 1]!, coastOffset * 0.12),
  ];
  return resamplePolyline(polyline, count);
}
