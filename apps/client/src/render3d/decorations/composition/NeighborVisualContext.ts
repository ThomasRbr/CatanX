import type { HexTile, TerrainType } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';

const WATER: ReadonlySet<TerrainType> = new Set(['ocean', 'lake', 'river']);

function isWater(terrain: TerrainType): boolean {
  return WATER.has(terrain);
}

export type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;

export interface NeighborEdgeInfo {
  dir: HexDirection;
  neighborId: string | null;
  neighborTerrain: TerrainType | null;
  sameBiome: boolean;
  isCoast: boolean;
}

export interface NeighborVisualContext {
  tileId: string;
  terrain: TerrainType;
  edges: NeighborEdgeInfo[];
  /** Directions that face matching biome neighbors (for massing). */
  sameBiomeDirs: HexDirection[];
  /** Directions that face water / map void. */
  coastDirs: HexDirection[];
}

/** Build six-neighbor visual context for edge clustering / coasts. */
export function buildNeighborVisualContext(
  tile: HexTile,
  tilesById: Map<string, HexTile>,
): NeighborVisualContext {
  const edges: NeighborEdgeInfo[] = [];
  const sameBiomeDirs: HexDirection[] = [];
  const coastDirs: HexDirection[] = [];

  for (let d = 0; d < 6; d++) {
    const dir = d as HexDirection;
    const nCoord = hexNeighbor(tile.coord, dir);
    const neighbor = tilesById.get(hexToId(nCoord));
    const neighborTerrain = neighbor?.terrain ?? null;
    const isCoast = !neighbor || isWater(neighbor.terrain);
    const sameBiome = Boolean(neighbor && neighbor.terrain === tile.terrain && !isCoast);

    edges.push({
      dir,
      neighborId: neighbor?.id ?? null,
      neighborTerrain,
      sameBiome,
      isCoast,
    });
    if (sameBiome) sameBiomeDirs.push(dir);
    if (isCoast) coastDirs.push(dir);
  }

  return {
    tileId: tile.id,
    terrain: tile.terrain,
    edges,
    sameBiomeDirs,
    coastDirs,
  };
}

export function buildNeighborMap(tiles: HexTile[]): Map<string, NeighborVisualContext> {
  const byId = new Map<string, HexTile>();
  for (const tile of tiles) byId.set(tile.id, tile);
  const out = new Map<string, NeighborVisualContext>();
  for (const tile of tiles) {
    out.set(tile.id, buildNeighborVisualContext(tile, byId));
  }
  return out;
}
