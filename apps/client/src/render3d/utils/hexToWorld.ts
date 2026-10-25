import type { CubeCoord, HexLayout, PixelCoord } from '@catanx/engine';
import { hexToPixel } from '@catanx/engine';

/** Default world-space hex radius (pointy-top). Matches engine math with size = HEX_WORLD_RADIUS. */
export const HEX_WORLD_RADIUS = 1;

export interface WorldCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Axial/cube → world (pointy-top). XZ is the board plane; Y is up.
 * Must stay consistent with `hexToPixel` when size === radius and flat === false.
 */
export function hexToWorld(q: number, r: number, radius = HEX_WORLD_RADIUS): WorldCoord {
  return {
    x: radius * Math.sqrt(3) * (q + r / 2),
    y: 0,
    z: radius * 1.5 * r,
  };
}

export function cubeToWorld(coord: CubeCoord, radius = HEX_WORLD_RADIUS): WorldCoord {
  return hexToWorld(coord.q, coord.r, radius);
}

/** Map 3D board XZ into the same 2D pixel space MiniMap / Pixi use. */
export function worldToPixelSpace(
  world: WorldCoord,
  layoutSize: number,
  radius = HEX_WORLD_RADIUS,
): PixelCoord {
  const scale = layoutSize / radius;
  return { x: world.x * scale, y: world.z * scale };
}

/** Verify pointy-top world XZ against engine `hexToPixel` (Y → Z). */
export function assertHexToWorldMatchesPixel(
  coord: CubeCoord,
  radius = HEX_WORLD_RADIUS,
): { world: WorldCoord; pixel: PixelCoord; ok: boolean } {
  const layout: HexLayout = { size: radius, origin: { x: 0, y: 0 }, flat: false };
  const pixel = hexToPixel(coord, layout);
  const world = cubeToWorld(coord, radius);
  const ok =
    Math.abs(world.x - pixel.x) < 1e-9 && Math.abs(world.z - pixel.y) < 1e-9;
  return { world, pixel, ok };
}
