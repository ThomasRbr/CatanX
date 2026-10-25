import { HEX_DIRECTIONS } from '@catanx/engine';
import { HEX_WORLD_RADIUS } from './hexToWorld';

/** World-space offset from hex center toward neighbor edge (pointy-top). */
export function edgeOffset(dirIndex: number, distance: number): { x: number; z: number } {
  const dir = HEX_DIRECTIONS[dirIndex]!;
  const dx = HEX_WORLD_RADIUS * Math.sqrt(3) * (dir.q + dir.r / 2);
  const dz = HEX_WORLD_RADIUS * 1.5 * dir.r;
  const len = Math.hypot(dx, dz) || 1;
  return { x: (dx / len) * distance, z: (dz / len) * distance };
}

/** Y-rotation so local +X runs along the shore (tangent to neighbor direction). */
export function shoreRotationY(dirIndex: number): number {
  const dir = HEX_DIRECTIONS[dirIndex]!;
  const dx = Math.sqrt(3) * (dir.q + dir.r / 2);
  const dz = 1.5 * dir.r;
  // Radial angle, then +π/2 so box length follows the edge
  return Math.atan2(dx, dz) + Math.PI / 2;
}

/** Y-rotation aligning local +Z with the neighbor radial direction. */
export function radialRotationY(dirIndex: number): number {
  const dir = HEX_DIRECTIONS[dirIndex]!;
  const dx = Math.sqrt(3) * (dir.q + dir.r / 2);
  const dz = 1.5 * dir.r;
  return Math.atan2(dx, dz);
}
