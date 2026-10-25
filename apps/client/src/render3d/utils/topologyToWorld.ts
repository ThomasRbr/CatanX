import type { CatanIntersection, HexLayout } from '@catanx/engine';
import { buildCatanTopology } from '@catanx/engine';
import type { HexTile } from '@catanx/engine';
import { HEX_SLAB_THICKNESS } from './createHexGeometry';
import { HEX_WORLD_RADIUS, type WorldCoord } from './hexToWorld';

/** Layout so topology x/y match 3D board XZ (same math as hexToWorld). */
export const WORLD_TOPOLOGY_LAYOUT: HexLayout = {
  size: HEX_WORLD_RADIUS,
  origin: { x: 0, y: 0 },
  flat: false,
};

export function buildWorldTopology(map: Map<string, HexTile>) {
  return buildCatanTopology(map, WORLD_TOPOLOGY_LAYOUT);
}

export function intersectionToWorld(
  intersection: Pick<CatanIntersection, 'x' | 'y'>,
  y = HEX_SLAB_THICKNESS + 0.02,
): WorldCoord {
  return { x: intersection.x, y, z: intersection.y };
}

export function midpointWorld(
  a: WorldCoord,
  b: WorldCoord,
  y = HEX_SLAB_THICKNESS + 0.04,
): WorldCoord {
  return {
    x: (a.x + b.x) / 2,
    y,
    z: (a.z + b.z) / 2,
  };
}

export function yawBetween(a: WorldCoord, b: WorldCoord): number {
  // Align local +Z with (b - a) on the XZ plane (Three.js Y-up).
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/**
 * Align local +X with (b - a) on the XZ plane.
 * Required for stretchable road/bridge meshes elongated on +X.
 * (Three.js rotation Y: local +X → (cos θ, 0, −sin θ).)
 */
export function yawAlignLocalX(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(az - bz, bx - ax);
}

/** Longest horizontal extent of a geometry (prefer X for road GLBs). */
export function geometryLengthX(geo: { boundingBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null; computeBoundingBox?: () => void }): number {
  if (!geo.boundingBox && typeof geo.computeBoundingBox === 'function') {
    geo.computeBoundingBox();
  }
  const box = geo.boundingBox;
  if (!box) return 0.84;
  return Math.max(0.05, box.max.x - box.min.x);
}

export function distanceXZ(a: WorldCoord, b: WorldCoord): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}
