import type { CatanTopology, GameState, RoadSegment } from '@catanx/engine';
import type { InitialPlacementState } from '../../store/gameStore';
import { resolveBuildingVisual } from './buildingVisual';
import { cubeToWorld, type WorldCoord } from './hexToWorld';
import { HEX_SLAB_THICKNESS } from './createHexGeometry';
import { distanceXZ, intersectionToWorld } from './topologyToWorld';

export type EdgeRoadMap = Record<string, string>;

/** Edge → owner from classic board, live setup overlay, and action-log metadata. */
export function collectEdgeRoads(
  gameState: GameState,
  setup?: InitialPlacementState | null,
): EdgeRoadMap {
  const out: EdgeRoadMap = {};
  const boardRoads = gameState.classicBoard?.roadsByEdge;
  if (boardRoads) {
    Object.assign(out, boardRoads);
  }
  if (setup?.roadsByEdge) {
    Object.assign(out, setup.roadsByEdge);
  }
  for (const entry of gameState.actionLog) {
    const edgeId = entry.data?.edgeId;
    if (typeof edgeId === 'string' && entry.playerId) {
      out[edgeId] = entry.playerId;
    }
  }
  return out;
}

export interface ResolvedRoadSegment {
  key: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  ownerId: string;
  type: RoadSegment['type'];
  /** H5 — dirt vs stone paving. */
  surface: 'dirt' | 'paved';
}

function endpointsForEdge(
  topology: CatanTopology,
  edgeId: string,
): { ax: number; az: number; bx: number; bz: number } | null {
  const edge = topology.edges[edgeId];
  if (!edge) return null;
  const a = topology.intersections[edge.a];
  const b = topology.intersections[edge.b];
  if (!a || !b) return null;
  const wa = intersectionToWorld(a);
  const wb = intersectionToWorld(b);
  return { ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z };
}

function isOpenWater(terrain: string | undefined): boolean {
  return terrain === 'ocean' || terrain === 'lake' || terrain === 'river';
}

function isLandish(terrain: string | undefined): boolean {
  if (!terrain) return false;
  return !isOpenWater(terrain);
}

/** True only for edges that actually span land ↔ open water (coastal bridge). */
function edgeIsCoastalBridge(
  edgeId: string,
  topology: CatanTopology,
  gameState: GameState,
): boolean {
  const edge = topology.edges[edgeId];
  if (!edge || edge.tileIds.length < 1) return false;
  let hasWater = false;
  let hasLand = false;
  for (const tid of edge.tileIds) {
    const tile = gameState.map.get(tid);
    const t = tile?.terrain;
    if (isOpenWater(t)) hasWater = true;
    else if (isLandish(t)) hasLand = true;
  }
  // Single-tile edge at map void: treat as bridge if the lone tile is land facing void sea.
  if (edge.tileIds.length === 1 && hasLand) {
    // Classic boards usually have ocean tiles; void edges are rare — keep as dirt road.
    return false;
  }
  return hasWater && hasLand;
}

function edgeNearCity(edgeId: string, topology: CatanTopology, gameState: GameState): boolean {
  const edge = topology.edges[edgeId];
  if (!edge || !gameState.buildings) return false;
  const ids = new Set([edge.a, edge.b]);
  for (const building of gameState.buildings.values()) {
    if (!building.placementIntersectionId || !ids.has(building.placementIntersectionId)) continue;
    const visual = resolveBuildingVisual(building.definitionId);
    if (visual === 'city' || visual === 'metropolis') return true;
  }
  return false;
}

/**
 * Prefer topology edges (classic look). Fallback: non-degenerate player.roads
 * not already covered by an edge (engine stub roads).
 */
export function resolveRoadsForRender(
  gameState: GameState,
  topology: CatanTopology,
  setup?: InitialPlacementState | null,
): ResolvedRoadSegment[] {
  const edgeRoads = collectEdgeRoads(gameState, setup);
  const out: ResolvedRoadSegment[] = [];
  const coveredOwners = new Map<string, number>();

  for (const [edgeId, ownerId] of Object.entries(edgeRoads)) {
    const ends = endpointsForEdge(topology, edgeId);
    if (!ends) continue;
    if (distanceXZ({ x: ends.ax, y: 0, z: ends.az }, { x: ends.bx, y: 0, z: ends.bz }) < 0.04) {
      continue;
    }
    const water = edgeIsCoastalBridge(edgeId, topology, gameState);
    const paved = edgeNearCity(edgeId, topology, gameState);
    out.push({
      key: `edge-${edgeId}`,
      ...ends,
      ownerId,
      type: water ? 'bridge' : 'road',
      surface: paved && !water ? 'paved' : 'dirt',
    });
    coveredOwners.set(ownerId, (coveredOwners.get(ownerId) ?? 0) + 1);
  }

  // Avec une topologie classique, roadsByEdge est la seule source autoritaire.
  // Les anciennes entrées player.roads utilisent des centres de tuiles et créent
  // sinon de longues routes qui traversent visuellement un hexagone entier.
  if (gameState.classicBoard) return out;

  for (const [playerId, player] of gameState.players) {
    const already = coveredOwners.get(playerId) ?? 0;
    let extras = 0;
    player.roads.forEach((road, index) => {
      if (index < already) return;
      const from = cubeToWorld(road.from);
      const to = cubeToWorld(road.to);
      const surface: 'dirt' | 'paved' = road.level >= 2 ? 'paved' : 'dirt';
      if (distanceXZ(from, to) < 0.08) {
        const stub = stubTowardNearestEdge(topology, from, playerId, gameState);
        if (!stub) return;
        out.push({
          key: `stub-${playerId}-${index}`,
          ...stub,
          ownerId: playerId,
          type: road.type,
          surface,
        });
        extras += 1;
        return;
      }
      out.push({
        key: `tile-${playerId}-${index}`,
        ax: from.x,
        az: from.z,
        bx: to.x,
        bz: to.z,
        ownerId: playerId,
        type: road.type,
        surface,
      });
      extras += 1;
    });
    if (extras > 0) coveredOwners.set(playerId, already + extras);
  }

  return out;
}

function stubTowardNearestEdge(
  topology: CatanTopology,
  center: WorldCoord,
  _playerId: string,
  _gameState: GameState,
): { ax: number; az: number; bx: number; bz: number } | null {
  let best: { ax: number; az: number; bx: number; bz: number } | null = null;
  let bestDist = Infinity;
  for (const edge of Object.values(topology.edges)) {
    const a = topology.intersections[edge.a];
    const b = topology.intersections[edge.b];
    if (!a || !b) continue;
    const wa = intersectionToWorld(a);
    const wb = intersectionToWorld(b);
    const mid = { x: (wa.x + wb.x) / 2, y: 0, z: (wa.z + wb.z) / 2 };
    const d = distanceXZ(center, mid);
    if (d < bestDist && d < 1.2) {
      bestDist = d;
      // Half-length stub from center toward edge midpoint
      best = {
        ax: center.x,
        az: center.z,
        bx: center.x + (mid.x - center.x) * 0.72,
        bz: center.z + (mid.z - center.z) * 0.72,
      };
    }
  }
  return best;
}

export function findSharedEdgeId(
  topology: CatanTopology,
  tileA: string,
  tileB: string,
): string | null {
  for (const [edgeId, edge] of Object.entries(topology.edges)) {
    if (edge.tileIds.includes(tileA) && edge.tileIds.includes(tileB)) return edgeId;
  }
  return null;
}

export function roadYForType(type: RoadSegment['type']): number {
  if (type === 'bridge') return HEX_SLAB_THICKNESS + 0.082;
  if (type === 'canal' || type === 'aqueduct') return HEX_SLAB_THICKNESS + 0.058;
  // A selected/hovered hex can rise by 0.05. Roads need to remain above that
  // temporary relief so their ownership and continuity never disappear in a seam.
  return HEX_SLAB_THICKNESS + 0.068;
}

/** Placement preview remains visibly above the final road. */
export const ROAD_PREVIEW_Y = HEX_SLAB_THICKNESS + 0.094;
