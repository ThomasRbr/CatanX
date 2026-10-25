import type { GroundClearings } from './BladeField';

/**
 * Keeps trees from hiding the pieces players need to see.
 *
 * Grass already stays off house plots and road beds; trees did not, so a city
 * founded at the edge of a forest disappeared under the canopy. A tree hides
 * what stands *behind* it from the camera, and the board camera sits on the
 * +X/+Z side at roughly 42° pitch: a crown of height h covers anything closer
 * than about h / tan(42°) ≈ 1.1·h behind it. The clearance is therefore an
 * egg shape — wide on the camera side, tight behind the building — so villages
 * read clearly without carving bald patches out of every forest.
 */

/** Unit vector toward the camera on the ground plane. */
const TOWARD_CAMERA_X = Math.SQRT1_2;
const TOWARD_CAMERA_Z = Math.SQRT1_2;

/** Extra clearance beyond the building's own plot radius. */
const FRONT_MARGIN = 0.58;
const SIDE_MARGIN = 0.2;
const BACK_MARGIN = 0.08;
/** Grass clearings hug the plot; a town cluster with its banner spreads wider. */
const FOOTPRINT_SCALE = 1.45;
const ROAD_MARGIN = 0.07;

function distanceToSegmentSq(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
  const px = ax + dx * t - x;
  const pz = az + dz * t - z;
  return px * px + pz * pz;
}

/** True when a tree at (x, z) would hide a building or sit on a road. */
export function treeBlocksView(x: number, z: number, clearings: GroundClearings | null | undefined): boolean {
  if (!clearings) return false;
  for (const point of clearings.points) {
    const dx = x - point.x;
    const dz = z - point.z;
    const along = dx * TOWARD_CAMERA_X + dz * TOWARD_CAMERA_Z;
    const across = dx * TOWARD_CAMERA_Z - dz * TOWARD_CAMERA_X;
    const footprint = point.r * FOOTPRINT_SCALE;
    const reach = footprint + (along > 0 ? FRONT_MARGIN : BACK_MARGIN);
    const side = footprint + SIDE_MARGIN;
    // Ellipse: long axis toward the camera.
    if ((along * along) / (reach * reach) + (across * across) / (side * side) < 1) return true;
  }
  for (const road of clearings.segments) {
    const clear = road.r + ROAD_MARGIN;
    if (distanceToSegmentSq(x, z, road.ax, road.az, road.bx, road.bz) < clear * clear) return true;
  }
  return false;
}
