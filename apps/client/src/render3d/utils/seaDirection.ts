import type { CubeCoord, GameState, HexDirection } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import { isWaterTerrain } from '../decorations/deterministicDecoration';

/** Returned by `findSeaDirection` when a tile touches no water at all. */
export const NO_SEA_DIRECTION = -1;

/**
 * Which way the open sea lies from a tile, or `NO_SEA_DIRECTION` when the tile
 * is landlocked.
 *
 * Two copies of this used to live in `AmbientLife` and `Ports3D`, both of which
 * returned direction 0 for a landlocked tile. Callers could not distinguish that
 * from a real answer, so a port surrounded by land moored its boat in a field
 * and the dock pointed inland. Failure is explicit here, and there is one copy.
 */
export function findSeaDirection(coord: CubeCoord, map: GameState['map']): number {
  let bestDir = NO_SEA_DIRECTION;
  let bestScore = 0;
  for (let d = 0; d < 6; d++) {
    const neighbour = map.get(hexToId(hexNeighbor(coord, d as HexDirection)));
    // Off-map is open ocean and outranks on-map water, so boats and docks face
    // the sea rather than an inland lake whenever both are available.
    const score = !neighbour ? 3
      : neighbour.terrain === 'ocean' ? 2
        : isWaterTerrain(neighbour.terrain) ? 1
          : 0;
    if (score > bestScore) {
      bestScore = score;
      bestDir = d;
    }
  }
  return bestDir;
}

/** True when the tile has at least one water (or off-map) neighbour. */
export function isCoastalTile(coord: CubeCoord, map: GameState['map']): boolean {
  return findSeaDirection(coord, map) !== NO_SEA_DIRECTION;
}
