import type { HexTile } from '@catanx/engine';
import * as THREE from 'three';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';

export interface ShoreField {
  texture: THREE.DataTexture;
  /** World-space XZ origin of the texture's (0,0) texel. */
  origin: THREE.Vector2;
  /** World-space XZ span the texture covers. */
  size: THREE.Vector2;
  /** World distance encoded by a full 0→1 sweep of the red channel. */
  range: number;
  dispose: () => void;
}

/** Land is treated as a disc slightly inside the hex circumradius. */
const LAND_RADIUS = HEX_WORLD_RADIUS * 0.94;
/** How far offshore the shallow gradient runs before the water is fully deep. */
const SHORE_RANGE = 5.5;
const RESOLUTION = 192;

/**
 * Distance-to-shore field sampled by the ocean shader.
 *
 * The old ocean faded its shallow colour by radial distance from the board
 * centre, which put turquoise in open water off the narrow ends of the island
 * and deep blue right against the coast on the wide ones. A real field makes
 * the shallows follow the actual coastline.
 */
export function buildShoreField(tiles: readonly HexTile[]): ShoreField {
  const land = tiles
    .filter((tile) => !isWaterTerrain(tile.terrain))
    .map((tile) => cubeToWorld(tile.coord));

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of land) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  if (land.length === 0) {
    minX = -1;
    maxX = 1;
    minZ = -1;
    maxZ = 1;
  }

  // Margin must exceed SHORE_RANGE, otherwise clamp-to-edge sampling would
  // smear a mid-gradient value across the whole open sea.
  const margin = LAND_RADIUS + SHORE_RANGE + 1.5;
  const origin = new THREE.Vector2(minX - margin, minZ - margin);
  const size = new THREE.Vector2(maxX - minX + margin * 2, maxZ - minZ + margin * 2);

  const data = new Uint8Array(RESOLUTION * RESOLUTION);
  for (let y = 0; y < RESOLUTION; y++) {
    const worldZ = origin.y + (y / (RESOLUTION - 1)) * size.y;
    for (let x = 0; x < RESOLUTION; x++) {
      const worldX = origin.x + (x / (RESOLUTION - 1)) * size.x;
      let nearestSq = Number.POSITIVE_INFINITY;
      for (const point of land) {
        const dx = worldX - point.x;
        const dz = worldZ - point.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < nearestSq) nearestSq = distanceSq;
      }
      const distance = Math.sqrt(nearestSq) - LAND_RADIUS;
      // 0 at the waterline, 1 once fully offshore. Negative (under land) also
      // clamps to 0 so the shader gets a clean shoreline.
      const encoded = THREE.MathUtils.clamp(distance / SHORE_RANGE, 0, 1);
      data[y * RESOLUTION + x] = Math.round(encoded * 255);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    RESOLUTION,
    RESOLUTION,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.name = 'CatanX shore distance field';
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  return {
    texture,
    origin,
    size,
    range: SHORE_RANGE,
    dispose: () => texture.dispose(),
  };
}
