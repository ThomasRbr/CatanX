/**
 * The cave layout, terrain mesh and dressing depend only on the map and the
 * underground graph, which never change during a game. The layer unmounts
 * every time the player switches back to the surface, so the heavy build is
 * kept here across mounts instead of in component memo.
 */
import type * as THREE from 'three';
import type { HexTile, UndergroundGraph } from '@catanx/engine';
import { hashString } from '../../utils/seededVisualRandom';
import { buildCavernDecor, type CavernDecor } from './cavernDecor';
import { buildCavernTerrain, buildSeamGeometry } from './cavernGeometry';
import { buildCavernLayout, type CavernLayout } from './cavernLayout';

export interface CavernBuild {
  key: string;
  layout: CavernLayout;
  terrain: THREE.BufferGeometry;
  /** Glowing lava ribbons (null when no seam crosses solid rock). */
  seam: THREE.BufferGeometry | null;
  decor: CavernDecor;
}

const MAX_ENTRIES = 2;
const cache = new Map<string, CavernBuild>();

export function cavernBuildKey(
  map: Map<string, HexTile>,
  graph: UndergroundGraph,
  mapSeed: number,
  maxVertices: number,
): string {
  const nodes = Object.values(graph.nodes)
    .map((n) => `${n.id}@${n.surfaceTileId}`)
    .sort()
    .join('|');
  const edges = Object.values(graph.edges)
    .map((e) => e.id)
    .sort()
    .join('|');
  return `${mapSeed}:${maxVertices}:${map.size}:${hashString(nodes)}:${hashString(edges)}`;
}

export function getCavernBuild(
  map: Map<string, HexTile>,
  graph: UndergroundGraph,
  mapSeed: number,
  maxVertices: number,
): CavernBuild {
  const key = cavernBuildKey(map, graph, mapSeed, maxVertices);
  const hit = cache.get(key);
  if (hit) {
    // Refresh LRU order.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const layout = buildCavernLayout(map, graph, mapSeed);
  const terrain = buildCavernTerrain(layout, { maxVertices });
  const seam = buildSeamGeometry(layout);
  const decor = buildCavernDecor(layout);
  const build: CavernBuild = { key, layout, terrain, seam, decor };
  cache.set(key, build);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string;
    const stale = cache.get(oldest);
    stale?.terrain.dispose();
    stale?.seam?.dispose();
    cache.delete(oldest);
  }
  return build;
}
